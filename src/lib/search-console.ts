/**
 * Google Search Console API integration.
 * Uses raw fetch with OAuth access tokens.
 * No external dependencies — mirrors the google-analytics.ts pattern.
 */

const SC_API_BASE = "https://www.googleapis.com/webmasters/v3"

// --- Types ---

export interface SearchConsoleSite {
  siteUrl: string        // e.g., "sc-domain:example.com" or "https://example.com/"
  permissionLevel: string // "siteOwner", "siteFullUser", "siteRestrictedUser", "siteUnverifiedUser"
}

export interface SearchConsoleRow {
  query: string
  page: string
  clicks: number
  impressions: number
  ctr: number
  position: number
}

export interface SearchConsoleDailyData {
  date: string  // YYYY-MM-DD
  rows: SearchConsoleRow[]
}

export interface SearchConsoleAggregates {
  totalClicks: number
  totalImpressions: number
  avgCtr: number
  avgPosition: number
}

// --- API Functions ---

/**
 * List all Search Console sites/properties accessible by the user.
 */
export async function listSearchConsoleSites(
  accessToken: string
): Promise<SearchConsoleSite[]> {
  const res = await fetch(`${SC_API_BASE}/sites`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Search Console API error: ${res.status} — ${body}`)
  }

  const data = (await res.json()) as {
    siteEntry?: Array<{ siteUrl: string; permissionLevel: string }>
  }

  return (data.siteEntry ?? []).map((entry) => ({
    siteUrl: entry.siteUrl,
    permissionLevel: entry.permissionLevel,
  }))
}

/**
 * Fetch Search Console data with query + page dimensions, grouped by date.
 * Handles pagination for large datasets (25k row limit per request).
 */
export async function fetchSearchConsoleData(
  siteUrl: string,
  accessToken: string,
  startDate: string,
  endDate: string
): Promise<SearchConsoleDailyData[]> {
  const allRows: Array<{
    date: string
    query: string
    page: string
    clicks: number
    impressions: number
    ctr: number
    position: number
  }> = []

  let startRow = 0
  const rowLimit = 25000

  // Paginate through all results
  while (true) {
    const res = await fetch(
      `${SC_API_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          startDate,
          endDate,
          dimensions: ["date", "query", "page"],
          rowLimit,
          startRow,
        }),
      }
    )

    if (!res.ok) {
      const body = await res.text()
      throw new Error(`Search Console query error: ${res.status} — ${body}`)
    }

    const data = (await res.json()) as {
      rows?: Array<{
        keys: string[] // [date, query, page]
        clicks: number
        impressions: number
        ctr: number
        position: number
      }>
    }

    const rows = data.rows ?? []

    for (const row of rows) {
      allRows.push({
        date: row.keys[0],
        query: row.keys[1],
        page: row.keys[2],
        clicks: row.clicks,
        impressions: row.impressions,
        ctr: row.ctr,
        position: row.position,
      })
    }

    // If we got fewer rows than the limit, we've reached the end
    if (rows.length < rowLimit) break
    startRow += rowLimit
  }

  // Group by date
  const byDate = new Map<string, SearchConsoleRow[]>()
  for (const row of allRows) {
    if (!byDate.has(row.date)) byDate.set(row.date, [])
    byDate.get(row.date)!.push({
      query: row.query,
      page: row.page,
      clicks: row.clicks,
      impressions: row.impressions,
      ctr: row.ctr,
      position: row.position,
    })
  }

  return Array.from(byDate.entries())
    .map(([date, rows]) => ({ date, rows }))
    .sort((a, b) => a.date.localeCompare(b.date))
}

/**
 * Fetch aggregate Search Console metrics (no dimensions — totals only).
 */
export async function fetchSearchConsoleAggregates(
  siteUrl: string,
  accessToken: string,
  startDate: string,
  endDate: string
): Promise<SearchConsoleAggregates> {
  const res = await fetch(
    `${SC_API_BASE}/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        startDate,
        endDate,
        // No dimensions = totals
      }),
    }
  )

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Search Console aggregates error: ${res.status} — ${body}`)
  }

  const data = (await res.json()) as {
    rows?: Array<{
      clicks: number
      impressions: number
      ctr: number
      position: number
    }>
  }

  const row = data.rows?.[0]
  return {
    totalClicks: row?.clicks ?? 0,
    totalImpressions: row?.impressions ?? 0,
    avgCtr: row?.ctr ?? 0,
    avgPosition: row?.position ?? 0,
  }
}
