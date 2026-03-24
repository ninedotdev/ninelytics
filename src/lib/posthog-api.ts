/**
 * PostHog Query API integration.
 * Uses HogQL (PostHog's SQL) via the Query endpoint.
 * No external dependencies — raw fetch with personal API key auth.
 */

export interface PostHogDailyStats {
  date: string
  pageViews: number
  uniqueVisitors: number
  sessions: number
  bounceRate: number     // 0-1
  avgSessionDuration: number // seconds
}

export interface PostHogBreakdowns {
  countries: { name: string; count: number }[]
  cities: { name: string; count: number }[]
  devices: { name: string; count: number }[]
  pages: { name: string; count: number }[]
  browsers: { name: string; count: number }[]
  os: { name: string; count: number }[]
  referrers: { name: string; count: number }[]
}

interface HogQLResponse {
  results: unknown[][]
  columns: string[]
  is_cached?: boolean
}

async function hogqlQuery(
  host: string,
  projectId: string,
  apiKey: string,
  query: string
): Promise<HogQLResponse> {
  const url = `${host}/api/projects/${projectId}/query/`

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query: { kind: "HogQLQuery", query },
    }),
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`PostHog API error: ${res.status} — ${body}`)
  }

  return res.json()
}

/**
 * Validate PostHog credentials by running a simple query.
 */
export async function validatePostHogCredentials(
  host: string,
  projectId: string,
  apiKey: string
): Promise<{ success: boolean }> {
  await hogqlQuery(host, projectId, apiKey, "SELECT 1")
  return { success: true }
}

/**
 * Fetch daily pageview and visitor stats.
 */
export async function fetchPostHogDailyStats(
  host: string,
  projectId: string,
  apiKey: string,
  startDate: string,
  endDate: string
): Promise<PostHogDailyStats[]> {
  // Pageviews + unique visitors by day
  const pvResult = await hogqlQuery(host, projectId, apiKey, `
    SELECT
      toDate(timestamp) as date,
      count() as pageviews,
      count(DISTINCT distinct_id) as visitors
    FROM events
    WHERE event = '$pageview'
      AND timestamp >= toDate('${startDate}')
      AND timestamp <= toDate('${endDate}') + INTERVAL 1 DAY
    GROUP BY date
    ORDER BY date
  `)

  // Sessions with bounce + duration by day (join events to get date)
  const sessResult = await hogqlQuery(host, projectId, apiKey, `
    SELECT
      toDate(e.timestamp) as date,
      count(DISTINCT e.properties.$session_id) as sessions,
      count(DISTINCT if(s.$pageview_count <= 1, e.properties.$session_id, NULL)) as bounced,
      avg(s.$session_duration) as avg_duration
    FROM events e
    JOIN sessions s ON e.properties.$session_id = s.session_id
    WHERE e.event = '$pageview'
      AND e.timestamp >= toDate('${startDate}')
      AND e.timestamp <= toDate('${endDate}') + INTERVAL 1 DAY
    GROUP BY date
    ORDER BY date
  `)

  // Merge by date
  const sessMap = new Map<string, { sessions: number; bounced: number; avgDuration: number }>()
  for (const row of sessResult.results) {
    const date = String(row[0])
    sessMap.set(date, {
      sessions: Number(row[1] ?? 0),
      bounced: Number(row[2] ?? 0),
      avgDuration: Number(row[3] ?? 0),
    })
  }

  return pvResult.results.map((row) => {
    const date = String(row[0])
    const sess = sessMap.get(date)
    const sessions = sess?.sessions ?? 0
    const bounced = sess?.bounced ?? 0
    return {
      date,
      pageViews: Number(row[1] ?? 0),
      uniqueVisitors: Number(row[2] ?? 0),
      sessions,
      bounceRate: sessions > 0 ? bounced / sessions : 0,
      avgSessionDuration: Math.round(sess?.avgDuration ?? 0),
    }
  })
}

/**
 * Fetch breakdowns: countries, cities, devices, pages, browsers, OS, referrers.
 */
export async function fetchPostHogBreakdowns(
  host: string,
  projectId: string,
  apiKey: string,
  startDate: string,
  endDate: string
): Promise<PostHogBreakdowns> {
  const dateFilter = `timestamp >= toDate('${startDate}') AND timestamp <= toDate('${endDate}') + INTERVAL 1 DAY`
  const pvFilter = `event = '$pageview' AND ${dateFilter}`

  const queries = [
    // Countries
    `SELECT properties.$geoip_country_name as name, count(DISTINCT distinct_id) as cnt FROM events WHERE ${pvFilter} AND name != '' GROUP BY name ORDER BY cnt DESC LIMIT 20`,
    // Cities
    `SELECT properties.$geoip_city_name as name, count(DISTINCT distinct_id) as cnt FROM events WHERE ${pvFilter} AND name != '' GROUP BY name ORDER BY cnt DESC LIMIT 20`,
    // Devices
    `SELECT properties.$device_type as name, count(DISTINCT distinct_id) as cnt FROM events WHERE ${pvFilter} AND name != '' GROUP BY name ORDER BY cnt DESC LIMIT 10`,
    // Pages — use $pathname, fallback empty results mean PostHog has limited data
    `SELECT coalesce(properties.$pathname, '/') as name, count() as cnt FROM events WHERE ${pvFilter} GROUP BY name ORDER BY cnt DESC LIMIT 20`,
    // Browsers
    `SELECT properties.$browser as name, count(DISTINCT distinct_id) as cnt FROM events WHERE ${pvFilter} AND name != '' GROUP BY name ORDER BY cnt DESC LIMIT 10`,
    // OS
    `SELECT properties.$os as name, count(DISTINCT distinct_id) as cnt FROM events WHERE ${pvFilter} AND name != '' GROUP BY name ORDER BY cnt DESC LIMIT 10`,
    // Referrers
    `SELECT properties.$referring_domain as name, count(DISTINCT distinct_id) as cnt FROM events WHERE ${pvFilter} AND name != '' AND name != '$direct' GROUP BY name ORDER BY cnt DESC LIMIT 20`,
  ]

  // Run sequentially to avoid PostHog's 3 concurrent query limit
  const results: HogQLResponse[] = []
  for (const q of queries) {
    try {
      results.push(await hogqlQuery(host, projectId, apiKey, q))
    } catch {
      results.push({ results: [], columns: [] })
    }
  }

  const toBreakdown = (r: HogQLResponse) =>
    r.results.map((row) => ({
      name: String(row[0] ?? "Unknown"),
      count: Number(row[1] ?? 0),
    }))

  return {
    countries: toBreakdown(results[0]),
    cities: toBreakdown(results[1]),
    devices: toBreakdown(results[2]),
    pages: toBreakdown(results[3]),
    browsers: toBreakdown(results[4]),
    os: toBreakdown(results[5]),
    referrers: toBreakdown(results[6]),
  }
}
