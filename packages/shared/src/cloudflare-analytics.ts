/**
 * Cloudflare Analytics API integration.
 * Uses the CF GraphQL Analytics API to fetch historical zone analytics
 * and sync them into the local page_views and visitors tables.
 */

interface CloudflareHttpRequest {
  date: string
  requests: number
  pageViews: number
  uniques: number
  threats: number
  bytes: number
}

interface CloudflareGraphQLResponse {
  data?: {
    viewer: {
      zones: Array<{
        httpRequests1dGroups: Array<{
          dimensions: { date: string }
          sum: {
            requests: number
            pageViews: number
            threats: number
            bytes: number
          }
          uniq: {
            uniques: number
          }
        }>
      }>
    }
  }
  errors?: Array<{ message: string }>
}

export interface CloudflareDailyStats {
  date: string
  pageViews: number
  uniqueVisitors: number
  requests: number
}

export interface CloudflareSyncData {
  daily: CloudflareDailyStats[]
  breakdowns: CloudflareBreakdowns
}

export interface CloudflareZone {
  id: string
  name: string
  status: string
  accountName: string
}

/**
 * List all zones accessible by the given API token.
 * Paginates automatically to get all zones.
 */
export async function listCloudflareZones(apiToken: string): Promise<CloudflareZone[]> {
  const zones: CloudflareZone[] = []
  let page = 1
  const perPage = 50

  while (true) {
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/zones?per_page=${perPage}&page=${page}`,
      {
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
      }
    )

    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      const msg = (body as { errors?: Array<{ message: string }> })?.errors?.[0]?.message || res.statusText
      throw new Error(`Cloudflare API error: ${msg}`)
    }

    const body = await res.json() as {
      result: Array<{
        id: string
        name: string
        status: string
        account: { name: string }
      }>
      result_info: { total_pages: number; page: number }
    }

    for (const z of body.result) {
      zones.push({
        id: z.id,
        name: z.name,
        status: z.status,
        accountName: z.account.name,
      })
    }

    if (page >= body.result_info.total_pages) break
    page++
  }

  return zones
}

/**
 * Fetch daily analytics from Cloudflare for a given zone.
 * Uses the GraphQL Analytics API (httpRequests1dGroups).
 * Max range: 365 days back.
 */
export async function fetchCloudflareAnalytics(
  zoneId: string,
  apiToken: string,
  startDate: string,
  endDate: string
): Promise<CloudflareDailyStats[]> {
  const query = `
    query GetZoneAnalytics($zoneTag: string!, $since: Date!, $until: Date!) {
      viewer {
        zones(filter: { zoneTag: $zoneTag }) {
          httpRequests1dGroups(
            limit: 365
            filter: { date_geq: $since, date_leq: $until }
            orderBy: [date_ASC]
          ) {
            dimensions {
              date
            }
            sum {
              requests
              pageViews
              threats
              bytes
            }
            uniq {
              uniques
            }
          }
        }
      }
    }
  `

  const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query,
      variables: {
        zoneTag: zoneId,
        since: startDate,
        until: endDate,
      },
    }),
  })

  if (!res.ok) {
    throw new Error(`Cloudflare GraphQL API error: ${res.statusText}`)
  }

  const body = (await res.json()) as CloudflareGraphQLResponse

  if (body.errors && body.errors.length > 0) {
    throw new Error(`Cloudflare GraphQL error: ${body.errors[0].message}`)
  }

  const groups = body.data?.viewer?.zones?.[0]?.httpRequests1dGroups ?? []

  return groups.map((g) => ({
    date: g.dimensions.date,
    pageViews: g.sum.pageViews,
    uniqueVisitors: g.uniq.uniques,
    requests: g.sum.requests,
  }))
}

/**
 * Fetch daily stats + breakdowns in parallel for sync.
 * Returns everything needed to create rich imported records.
 */
export async function fetchCloudflareFullSync(
  zoneId: string,
  apiToken: string,
  startDate: string,
  endDate: string
): Promise<CloudflareSyncData> {
  const [daily, breakdowns] = await Promise.all([
    fetchCloudflareAnalytics(zoneId, apiToken, startDate, endDate),
    fetchCloudflareBreakdowns(zoneId, apiToken, startDate, endDate),
  ])
  return { daily, breakdowns }
}

export interface CloudflareBreakdowns {
  countries: Array<{ name: string; count: number }>
  devices: Array<{ name: string; count: number }>
  pages: Array<{ name: string; count: number }>
  browsers: Array<{ name: string; count: number }>
  os: Array<{ name: string; count: number }>
}

const emptyBreakdowns: CloudflareBreakdowns = { countries: [], devices: [], pages: [], browsers: [], os: [] }

/**
 * Fetch aggregate breakdowns from CF.
 * - countryMap/browserMap come from httpRequests1dGroups (supports 365d range).
 * - device type and OS come from httpRequestsAdaptiveGroups (dimensions).
 */
export async function fetchCloudflareBreakdowns(
  zoneId: string,
  apiToken: string,
  startDate: string,
  endDate: string
): Promise<CloudflareBreakdowns> {
  const cfFetch = async (query: string, variables: Record<string, string>) => {
    const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    })
    if (!res.ok) return null
    const body = await res.json() as { data?: { viewer: { zones: Array<Record<string, unknown>> } }; errors?: Array<{ message: string }> }
    if (body.errors?.length) {
      console.warn("CF breakdowns error:", body.errors[0].message)
      return null
    }
    return body.data?.viewer?.zones?.[0] ?? null
  }

  try {
    // Query 1: country + browser maps from httpRequests1dGroups
    const mapsQuery = `
      query ($zoneTag: string!, $since: Date!, $until: Date!) {
        viewer {
          zones(filter: { zoneTag: $zoneTag }) {
            httpRequests1dGroups(
              limit: 365
              filter: { date_geq: $since, date_leq: $until }
            ) {
              sum {
                countryMap { clientCountryName, requests }
                browserMap { uaBrowserFamily, pageViews }
              }
            }
          }
        }
      }
    `

    // Query 2: device type + OS from httpRequestsAdaptiveGroups (dimensions)
    // Free zones limit to 1-day range, so we query the last 7 days individually and aggregate
    const deviceOsQuery = `
      query ($zoneTag: string!, $since: Date!, $until: Date!) {
        viewer {
          zones(filter: { zoneTag: $zoneTag }) {
            deviceTypes: httpRequestsAdaptiveGroups(
              limit: 20
              filter: { date_geq: $since, date_leq: $until }
              orderBy: [count_DESC]
            ) {
              count
              dimensions { clientDeviceType }
            }
            osSystems: httpRequestsAdaptiveGroups(
              limit: 20
              filter: { date_geq: $since, date_leq: $until }
              orderBy: [count_DESC]
            ) {
              count
              dimensions { userAgentOS }
            }
            topPages: httpRequestsAdaptiveGroups(
              limit: 20
              filter: { date_geq: $since, date_leq: $until }
              orderBy: [count_DESC]
            ) {
              count
              dimensions { clientRequestPath }
            }
          }
        }
      }
    `

    // Build list of single-day ranges (last 7 days or within requested range)
    const rangeEnd = new Date(endDate)
    const rangeStart = new Date(startDate)
    const daysToQuery: string[] = []
    for (let i = 0; i < 7; i++) {
      const d = new Date(rangeEnd)
      d.setUTCDate(d.getUTCDate() - i)
      if (d < rangeStart) break
      daysToQuery.push(d.toISOString().slice(0, 10))
    }

    const vars = { zoneTag: zoneId, since: startDate, until: endDate }
    // Fetch maps (supports wide range) + device/OS per day in parallel
    const [mapsData, ...deviceOsDays] = await Promise.all([
      cfFetch(mapsQuery, vars),
      ...daysToQuery.map((day) =>
        cfFetch(deviceOsQuery, { zoneTag: zoneId, since: day, until: day })
      ),
    ])

    // Process country/browser maps
    const countryTotals = new Map<string, number>()
    const browserTotals = new Map<string, number>()
    const groups = (mapsData as { httpRequests1dGroups: Array<{ sum: { countryMap: Array<{ clientCountryName: string; requests: number }>; browserMap: Array<{ uaBrowserFamily: string; pageViews: number }> } }> } | null)?.httpRequests1dGroups ?? []

    for (const day of groups) {
      for (const c of day.sum.countryMap ?? []) {
        countryTotals.set(c.clientCountryName, (countryTotals.get(c.clientCountryName) ?? 0) + c.requests)
      }
      for (const b of day.sum.browserMap ?? []) {
        browserTotals.set(b.uaBrowserFamily, (browserTotals.get(b.uaBrowserFamily) ?? 0) + b.pageViews)
      }
    }

    // Aggregate device types, OS, and pages across queried days
    type AdaptiveZone = {
      deviceTypes: Array<{ count: number; dimensions: { clientDeviceType: string } }>
      osSystems: Array<{ count: number; dimensions: { userAgentOS: string } }>
      topPages: Array<{ count: number; dimensions: { clientRequestPath: string } }>
    }
    const deviceTotals = new Map<string, number>()
    const osTotals = new Map<string, number>()
    const pageTotals = new Map<string, number>()

    for (const dayData of deviceOsDays) {
      const zone = dayData as AdaptiveZone | null
      for (const d of zone?.deviceTypes ?? []) {
        const name = d.dimensions.clientDeviceType || "Bots / Other"
        deviceTotals.set(name, (deviceTotals.get(name) ?? 0) + d.count)
      }
      for (const o of zone?.osSystems ?? []) {
        const name = o.dimensions.userAgentOS || "Bots / Other"
        osTotals.set(name, (osTotals.get(name) ?? 0) + o.count)
      }
      for (const p of zone?.topPages ?? []) {
        const path = p.dimensions.clientRequestPath || "/"
        if (!path.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|map|json)$/i)) {
          pageTotals.set(path, (pageTotals.get(path) ?? 0) + p.count)
        }
      }
    }

    const toSorted = (map: Map<string, number>) =>
      Array.from(map.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 20)
        .map(([name, count]) => ({ name: name || "Bots / Other", count }))

    return {
      countries: toSorted(countryTotals),
      browsers: toSorted(browserTotals),
      devices: toSorted(deviceTotals),
      os: toSorted(osTotals),
      pages: toSorted(pageTotals),
    }
  } catch (err) {
    console.warn("CF breakdowns fetch error:", err)
    return emptyBreakdowns
  }
}
