/**
 * Google Analytics 4 Data API integration.
 * Uses raw fetch with manual JWT authentication from a Service Account JSON key.
 * No external dependencies — mirrors the cloudflare-analytics.ts pattern.
 */

import crypto from "node:crypto"

// --- Types ---

export interface GAProperty {
  name: string        // e.g., "properties/123456"
  displayName: string // e.g., "My Website"
  propertyType: string
}

export interface GADailyStats {
  date: string           // YYYY-MM-DD
  pageViews: number
  uniqueVisitors: number
  sessions: number
  bounceRate: number     // 0-1
  avgSessionDuration: number // seconds
}

export interface GABreakdowns {
  countries: { name: string; count: number }[]
  cities: { name: string; count: number }[]
  devices: { name: string; count: number }[]
  pages: { name: string; count: number }[]
  browsers: { name: string; count: number }[]
  os: { name: string; count: number }[]
  sources: { name: string; count: number }[]
}

interface ServiceAccountKey {
  type: string
  project_id: string
  private_key_id: string
  private_key: string
  client_email: string
  client_id: string
  auth_uri: string
  token_uri: string
}

// --- JWT Auth ---

function base64url(input: string | Buffer): string {
  const buf = typeof input === "string" ? Buffer.from(input) : input
  return buf.toString("base64url")
}

async function getAccessToken(credentials: string): Promise<string> {
  const key: ServiceAccountKey = JSON.parse(credentials)

  const now = Math.floor(Date.now() / 1000)
  const header = { alg: "RS256", typ: "JWT" }
  const payload = {
    iss: key.client_email,
    scope: "https://www.googleapis.com/auth/analytics.readonly",
    aud: key.token_uri,
    iat: now,
    exp: now + 3600,
  }

  const headerB64 = base64url(JSON.stringify(header))
  const payloadB64 = base64url(JSON.stringify(payload))
  const signInput = `${headerB64}.${payloadB64}`

  const sign = crypto.createSign("RSA-SHA256")
  sign.update(signInput)
  const signature = sign.sign(key.private_key, "base64url")

  const jwt = `${signInput}.${signature}`

  const res = await fetch(key.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
  })

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`Google OAuth error: ${res.status} — ${body}`)
  }

  const data = await res.json() as { access_token: string }
  return data.access_token
}

// Token cache (1 hour lifetime)
let cachedToken: { token: string; expiry: number } | null = null

async function getToken(credentials: string): Promise<string> {
  if (cachedToken && cachedToken.expiry > Date.now()) {
    return cachedToken.token
  }
  const token = await getAccessToken(credentials)
  cachedToken = { token, expiry: Date.now() + 50 * 60 * 1000 } // Cache for 50 min
  return token
}

/**
 * Resolve an access token from either an OAuth token or service account credentials.
 * When isOAuth is true, tokenOrCredentials is already a bearer token.
 * When false, it's a service account JSON that needs JWT signing.
 */
async function resolveToken(tokenOrCredentials: string, isOAuth: boolean): Promise<string> {
  if (isOAuth) return tokenOrCredentials
  return getToken(tokenOrCredentials)
}

// --- API Functions ---

/**
 * List GA4 properties accessible by the service account or OAuth user.
 */
export async function listGAProperties(credentials: string, isOAuth = false): Promise<GAProperty[]> {
  const token = await resolveToken(credentials, isOAuth)

  const res = await fetch(
    "https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200",
    {
      headers: { Authorization: `Bearer ${token}` },
    }
  )

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`GA Admin API error: ${res.status} — ${body}`)
  }

  const data = await res.json() as {
    accountSummaries?: Array<{
      account: string
      displayName: string
      propertySummaries?: Array<{
        property: string
        displayName: string
        propertyType: string
      }>
    }>
  }

  const properties: GAProperty[] = []
  for (const account of data.accountSummaries ?? []) {
    for (const prop of account.propertySummaries ?? []) {
      properties.push({
        name: prop.property,
        displayName: `${prop.displayName} (${account.displayName})`,
        propertyType: prop.propertyType,
      })
    }
  }

  return properties
}

/**
 * Fetch daily pageviews + unique users for a date range.
 * Uses GA4 Data API runReport.
 */
export async function fetchGAAnalytics(
  propertyId: string,
  credentials: string,
  startDate: string,
  endDate: string,
  isOAuth = false
): Promise<GADailyStats[]> {
  const token = await resolveToken(credentials, isOAuth)

  const res = await fetch(
    `https://analyticsdata.googleapis.com/v1beta/${propertyId}:runReport`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dateRanges: [{ startDate, endDate }],
        dimensions: [{ name: "date" }],
        metrics: [
          { name: "screenPageViews" },
          { name: "totalUsers" },
          { name: "sessions" },
          { name: "bounceRate" },
          { name: "averageSessionDuration" },
        ],
        orderBys: [{ dimension: { dimensionName: "date" } }],
        limit: 366,
      }),
    }
  )

  if (!res.ok) {
    const body = await res.text()
    throw new Error(`GA Data API error: ${res.status} — ${body}`)
  }

  const data = await res.json() as {
    rows?: Array<{
      dimensionValues: Array<{ value: string }>
      metricValues: Array<{ value: string }>
    }>
  }

  return (data.rows ?? []).map((row) => {
    const dateRaw = row.dimensionValues[0]?.value ?? ""
    // Convert YYYYMMDD to YYYY-MM-DD
    const date = `${dateRaw.slice(0, 4)}-${dateRaw.slice(4, 6)}-${dateRaw.slice(6, 8)}`
    return {
      date,
      pageViews: Number(row.metricValues[0]?.value ?? 0),
      uniqueVisitors: Number(row.metricValues[1]?.value ?? 0),
      sessions: Number(row.metricValues[2]?.value ?? 0),
      bounceRate: Number(row.metricValues[3]?.value ?? 0),
      avgSessionDuration: Number(row.metricValues[4]?.value ?? 0),
    }
  })
}

/**
 * Fetch aggregate breakdowns from GA4: countries, devices, pages, browsers.
 * Each runs as a separate report (parallel) with individual error handling.
 */
export async function fetchGABreakdowns(
  propertyId: string,
  credentials: string,
  startDate: string,
  endDate: string,
  isOAuth = false
): Promise<GABreakdowns> {
  const token = await resolveToken(credentials, isOAuth)

  const fetchBreakdown = async (
    dimension: string,
    metric: string = "totalUsers"
  ): Promise<{ name: string; count: number }[]> => {
    try {
      const res = await fetch(
        `https://analyticsdata.googleapis.com/v1beta/${propertyId}:runReport`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            dateRanges: [{ startDate, endDate }],
            dimensions: [{ name: dimension }],
            metrics: [{ name: metric }],
            orderBys: [{ metric: { metricName: metric }, desc: true }],
            limit: 20,
          }),
        }
      )

      if (!res.ok) return []

      const data = await res.json() as {
        rows?: Array<{
          dimensionValues: Array<{ value: string }>
          metricValues: Array<{ value: string }>
        }>
      }

      return (data.rows ?? []).map((row) => ({
        name: row.dimensionValues[0]?.value ?? "Unknown",
        count: Number(row.metricValues[0]?.value ?? 0),
      }))
    } catch {
      return []
    }
  }

  const [countries, cities, devices, pages, browsers, os, sources] = await Promise.all([
    fetchBreakdown("country"),
    fetchBreakdown("city"),
    fetchBreakdown("deviceCategory"),
    fetchBreakdown("pagePath", "screenPageViews"),
    fetchBreakdown("browser"),
    fetchBreakdown("operatingSystem"),
    fetchBreakdown("sessionSource", "sessions"),
  ])

  return { countries, cities, devices, pages, browsers, os, sources }
}

/**
 * Validate credentials by attempting to list properties.
 * Throws if credentials are invalid.
 */
export async function validateGACredentials(credentials: string): Promise<number> {
  // First validate JSON structure
  try {
    const key = JSON.parse(credentials) as Partial<ServiceAccountKey>
    if (!key.client_email || !key.private_key || !key.token_uri) {
      throw new Error("Missing required fields in service account JSON")
    }
  } catch (e) {
    if (e instanceof SyntaxError) {
      throw new Error("Invalid JSON — paste the full service account key file content")
    }
    throw e
  }

  const properties = await listGAProperties(credentials)
  return properties.length
}
