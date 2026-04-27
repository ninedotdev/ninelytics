/**
 * Geolocation service
 * Priority: 1. Provider headers (Cloudflare, Vercel, CloudFront)
 *           2. MaxMind GeoLite2 local database (if available)
 *           3. ip-api.com API (free tier: 45 requests per minute, fallback)
 */

import path from 'node:path'
import { existsSync } from 'node:fs'

interface GeoLocation {
  country: string | null
  countryCode: string | null
  region: string | null
  regionName: string | null
  city: string | null
  zip: string | null
  lat: number | null
  lon: number | null
  timezone: string | null
  isp: string | null
}

interface IpApiResponse {
  status: string
  country?: string
  countryCode?: string
  region?: string
  regionName?: string
  city?: string
  zip?: string
  lat?: number
  lon?: number
  timezone?: string
  isp?: string
  query?: string
}

import { toCountryName } from './country-names'

// Provider headers configuration (like Umami)
const PROVIDER_HEADERS = [
  // Cloudflare headers
  {
    countryHeader: 'cf-ipcountry',
    regionHeader: 'cf-region-code',
    cityHeader: 'cf-ipcity',
  },
  // Vercel headers
  {
    countryHeader: 'x-vercel-ip-country',
    regionHeader: 'x-vercel-ip-country-region',
    cityHeader: 'x-vercel-ip-city',
  },
  // CloudFront headers
  {
    countryHeader: 'cloudfront-viewer-country',
    regionHeader: 'cloudfront-viewer-country-region',
    cityHeader: 'cloudfront-viewer-city',
  },
]

// Simple in-memory cache to avoid repeated lookups for the same IP.
// Hard-capped (LRU via Map insertion order) to prevent unbounded growth
// on long-running processes with many unique IPs.
const geoCache = new Map<string, { data: GeoLocation; timestamp: number }>()
const CACHE_DURATION = 24 * 60 * 60 * 1000 // 24 hours
const GEO_CACHE_MAX_ENTRIES = 50_000

function geoCacheSet(ip: string, data: GeoLocation) {
  // Refresh LRU position by deleting+re-inserting
  if (geoCache.has(ip)) geoCache.delete(ip)
  geoCache.set(ip, { data, timestamp: Date.now() })
  if (geoCache.size > GEO_CACHE_MAX_ENTRIES) {
    // Drop oldest entry (first key in insertion order)
    const oldest = geoCache.keys().next().value
    if (oldest !== undefined) geoCache.delete(oldest)
  }
}

// Circuit breaker for ip-api.com fallback
const circuitBreaker = {
  failures: 0,
  lastFailure: 0,
  isOpen: false,
  threshold: 3,        // Open after 3 consecutive failures
  resetTimeout: 300000, // Try again after 5 minutes
}

function isCircuitOpen(): boolean {
  if (!circuitBreaker.isOpen) return false
  // Check if enough time has passed to allow a probe
  if (Date.now() - circuitBreaker.lastFailure > circuitBreaker.resetTimeout) {
    return false // Allow one probe request
  }
  return true
}

function recordSuccess() {
  circuitBreaker.failures = 0
  circuitBreaker.isOpen = false
}

function recordFailure() {
  circuitBreaker.failures++
  circuitBreaker.lastFailure = Date.now()
  if (circuitBreaker.failures >= circuitBreaker.threshold) {
    circuitBreaker.isOpen = true
  }
}

// MaxMind reader singleton (lazy-initialized)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let maxmindReader: any = null
let maxmindInitialized = false
const MMDB_PATH = process.env.MAXMIND_DB_PATH ?? path.join(process.cwd(), 'data', 'GeoLite2-City.mmdb')

async function getMaxmindReader() {
  if (maxmindInitialized) return maxmindReader

  maxmindInitialized = true

  if (!existsSync(MMDB_PATH)) {
    return null
  }

  try {
    const maxmind = await import('maxmind')
    maxmindReader = await maxmind.default.open(MMDB_PATH)
    console.log('MaxMind GeoLite2-City database loaded')
  } catch (err) {
    console.warn('Failed to load MaxMind database, falling back to ip-api.com:', err)
    maxmindReader = null
  }

  return maxmindReader
}

interface PartialGeoFromHeaders {
  country: string | null
  countryCode: string | null
  region: string | null
  regionName: string | null
  city: string | null
  complete: boolean // true only when city is also present
}

/**
 * Get geolocation from provider headers (Cloudflare, Vercel, CloudFront).
 * Returns partial data flagged as incomplete when city is missing
 * (Cloudflare Free plan only provides cf-ipcountry, not cf-ipcity).
 */
function getLocationFromHeaders(headers: Headers): PartialGeoFromHeaders | null {
  if (process.env.SKIP_LOCATION_HEADERS === 'true') {
    return null
  }

  for (const provider of PROVIDER_HEADERS) {
    const countryHeader = headers.get(provider.countryHeader)
    if (countryHeader) {
      const raw = decodeURIComponent(countryHeader)
      // Headers normally carry an ISO 3166-1 alpha-2 code (e.g. "US").
      // Resolve to the full English name so the visitors.country column is
      // consistent with values produced by MaxMind / ip-api ("United
      // States"). Without this, GROUP BY country splits the same place into
      // two rows.
      const code = raw.length === 2 ? raw.toUpperCase() : null
      const resolved = toCountryName(raw)
      const fullName = resolved !== 'Unknown' ? resolved : raw
      const region = headers.get(provider.regionHeader)
      const cityRaw = headers.get(provider.cityHeader)
      const city = cityRaw ? decodeURIComponent(cityRaw) : null

      return {
        country: fullName || null,
        countryCode: code ?? raw.toUpperCase() ?? null,
        region: region || null,
        regionName: region || null,
        city,
        complete: city !== null,
      }
    }
  }

  return null
}

/**
 * Get geolocation from MaxMind local database (sub-millisecond, no rate limits)
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function getLocationFromMaxmind(reader: any, ipAddress: string): GeoLocation | null {
  try {
    const result = reader.get(ipAddress)
    if (!result) return null

    return {
      country: result.country?.names?.en ?? null,
      countryCode: result.country?.iso_code ?? null,
      region: result.subdivisions?.[0]?.iso_code ?? null,
      regionName: result.subdivisions?.[0]?.names?.en ?? null,
      city: result.city?.names?.en ?? null,
      zip: result.postal?.code ?? null,
      lat: result.location?.latitude ?? null,
      lon: result.location?.longitude ?? null,
      timezone: result.location?.time_zone ?? null,
      isp: null, // GeoLite2-City does not include ISP data
    }
  } catch {
    return null
  }
}

/**
 * Get geolocation data for an IP address
 * Priority: 1. Provider headers, 2. MaxMind local DB, 3. ip-api.com
 */
export async function getGeoLocation(
  ipAddress: string,
  headers?: Headers
): Promise<GeoLocation> {
  // 1. Try provider headers first (if available)
  let headerPartial: ReturnType<typeof getLocationFromHeaders> = null
  if (headers) {
    headerPartial = getLocationFromHeaders(headers)
    // If headers are complete (have city too), return immediately — no IP lookup needed
    if (headerPartial?.complete) {
      return {
        country: headerPartial.country,
        countryCode: headerPartial.countryCode,
        region: headerPartial.region,
        regionName: headerPartial.regionName,
        city: headerPartial.city,
        zip: null,
        lat: null,
        lon: null,
        timezone: null,
        isp: null,
      }
    }
  }

  // For localhost/unknown IPs we can't do an IP lookup,
  // but still return whatever CF headers gave us (country at minimum)
  if (!ipAddress || ipAddress === 'unknown' || ipAddress === '127.0.0.1' || ipAddress === '::1'
    || ipAddress.startsWith('10.') || ipAddress.startsWith('172.16.') || ipAddress.startsWith('192.168.')) {
    if (headerPartial) {
      return {
        country: headerPartial.country,
        countryCode: headerPartial.countryCode,
        region: headerPartial.region,
        regionName: headerPartial.regionName,
        city: headerPartial.city,
        zip: null, lat: null, lon: null, timezone: null, isp: null,
      }
    }
    return createNullGeoData()
  }

  // Check cache first
  const cached = geoCache.get(ipAddress)
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return mergeHeadersWithLookup(headerPartial, cached.data)
  }

  // 2. Try MaxMind local database
  const reader = await getMaxmindReader()
  if (reader) {
    const maxmindData = getLocationFromMaxmind(reader, ipAddress)
    if (maxmindData) {
      const merged = mergeHeadersWithLookup(headerPartial, maxmindData)
      geoCacheSet(ipAddress, merged)
      return merged
    }
  }

  // 3. Fallback: ip-api.com (free tier) with circuit breaker
  if (isCircuitOpen()) {
    // Circuit is open — skip external API to avoid blocking
    if (headerPartial) {
      return {
        country: headerPartial.country,
        countryCode: headerPartial.countryCode,
        region: headerPartial.region,
        regionName: headerPartial.regionName,
        city: headerPartial.city,
        zip: null, lat: null, lon: null, timezone: null, isp: null,
      }
    }
    return createNullGeoData()
  }

  try {
    const response = await fetch(
      `http://ip-api.com/json/${ipAddress}?fields=status,country,countryCode,region,regionName,city,zip,lat,lon,timezone,isp`,
      {
        headers: {
          'User-Agent': 'Analytics-App/1.0',
        },
        signal: AbortSignal.timeout(1500),
      }
    )

    if (!response.ok) {
      throw new Error(`Geolocation API error: ${response.status}`)
    }

    const data = (await response.json()) as IpApiResponse

    if (data.status !== 'success') {
      console.warn(`Geolocation failed for IP ${ipAddress}:`, data)
      recordFailure()
      return createNullGeoData()
    }

    recordSuccess()

    const lookupData: GeoLocation = {
      country: data.country ?? null,
      countryCode: data.countryCode ?? null,
      region: data.region ?? null,
      regionName: data.regionName ?? null,
      city: data.city || null,
      zip: data.zip || null,
      lat: data.lat || null,
      lon: data.lon || null,
      timezone: data.timezone || null,
      isp: data.isp || null,
    }

    const geoData = mergeHeadersWithLookup(headerPartial, lookupData)
    geoCacheSet(ipAddress, geoData)

    return geoData
  } catch (error) {
    recordFailure()
    console.warn('Geolocation unavailable (ip-api.com):', (error as Error).message)
    if (headerPartial) {
      return {
        country: headerPartial.country,
        countryCode: headerPartial.countryCode,
        region: headerPartial.region,
        regionName: headerPartial.regionName,
        city: headerPartial.city,
        zip: null, lat: null, lon: null, timezone: null, isp: null,
      }
    }
    return createNullGeoData()
  }
}

/**
 * Merge header-derived geo (typically only country, e.g. Cloudflare Free)
 * with IP-lookup geo (MaxMind / ip-api / cache) without producing
 * incoherent (city, country) pairs like "Paris, Spain".
 *
 * Rule:
 *   - No headers → return lookup as-is.
 *   - Headers + lookup agree on countryCode (ISO) → headers win for
 *     country/region (CDN edge is authoritative), lookup provides city/coords.
 *   - Headers + lookup disagree → trust the lookup as a coherent pair
 *     (country, region, city all from the same source). This is the case
 *     that fixes "Paris, Spain": header says ES, IP geolocates to FR/Paris,
 *     so we keep the FR+Paris pair instead of mixing.
 */
function mergeHeadersWithLookup(
  headerPartial: PartialGeoFromHeaders | null,
  lookup: GeoLocation
): GeoLocation {
  if (!headerPartial) return lookup

  const headerIso = headerPartial.countryCode?.toUpperCase() ?? null
  const lookupIso = lookup.countryCode?.toUpperCase() ?? null

  // If lookup has no country, headers fill in (no risk of mismatch).
  // If both present and disagree, prefer the lookup pair.
  if (lookupIso && headerIso && lookupIso !== headerIso) {
    return lookup
  }

  return {
    ...lookup,
    country: headerPartial.country ?? lookup.country,
    countryCode: headerPartial.countryCode ?? lookup.countryCode,
    region: headerPartial.region ?? lookup.region,
    regionName: headerPartial.regionName ?? lookup.regionName,
  }
}

function createNullGeoData(): GeoLocation {
  return {
    country: null,
    countryCode: null,
    region: null,
    regionName: null,
    city: null,
    zip: null,
    lat: null,
    lon: null,
    timezone: null,
    isp: null,
  }
}

/**
 * Clear old cache entries (called periodically)
 */
export function clearGeoCache() {
  const now = Date.now()
  for (const [ip, cached] of geoCache.entries()) {
    if (now - cached.timestamp > CACHE_DURATION) {
      geoCache.delete(ip)
    }
  }
}
