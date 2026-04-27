/**
 * Runtime-agnostic collection pipeline.
 * Ported from src/lib/collect.ts — uses Web standard Headers/Request
 * instead of NextRequest.
 */

import { db } from './db'
import { events, pageViews, performanceMetrics } from '@ninelytics/db/schema'
import { isBotRequest } from './bot-detection'
import { isIpBlocked } from './ip-filter'
import { normalizeUrl } from './url-normalization'
import { getGeoLocation } from './geolocation'
import { isPathExcluded } from './path-exclusions'
import { getActiveWebsiteByTrackingCode } from './tracking-websites'
import {
  upsertVisitor,
  upsertSession,
  updateSessionMetrics,
} from './tracking-helpers'
import { realtimeHelpers, isRedisConnected } from './redis'
import { getClientIp } from './get-client-ip'

/**
 * Generate a cookieless visitor ID from (websiteId, ip, ua, day-salt).
 * Stable for the same triple within a UTC day, rotates at 00:00 UTC.
 *
 * Bun ships `crypto.subtle` natively. We use SHA-256, not a HMAC: there's
 * no secret to leak, the hash is deliberately one-way for any individual
 * visitor (you can't recover IP from the hash without iterating the entire
 * IP space, which the day rotation defeats over time).
 */
async function deriveCookielessVisitorId(
  websiteId: string,
  ipAddress: string,
  userAgent: string,
): Promise<string> {
  const day = new Date().toISOString().slice(0, 10) // YYYY-MM-DD UTC
  const input = `${websiteId}|${ipAddress}|${userAgent}|${day}`
  const data = new TextEncoder().encode(input)
  const digest = await crypto.subtle.digest('SHA-256', data)
  const bytes = new Uint8Array(digest)
  // hex(first 16 bytes) = 32-char id, plenty of entropy and matches the
  // length of nanoid IDs the SDK produces in cookie mode.
  let hex = ''
  for (let i = 0; i < 16; i++) {
    hex += bytes[i]!.toString(16).padStart(2, '0')
  }
  return hex
}

// Collapse client-supplied device strings into a single canonical casing
// so "Mobile" / "mobile" / "MOBILE" all group as one row. We can't trust
// SDKs (or third-party integrations) to be consistent.
function normalizeDevice(d: string | null | undefined): string | null {
  if (!d) return null
  const t = d.trim()
  if (!t) return null
  return t[0]!.toUpperCase() + t.slice(1).toLowerCase()
}

export interface CollectPayload {
  type: 'pageview' | 'event' | 'session'
  trackingCode: string
  visitorId: string
  sessionId: string

  page?: string
  referrer?: string
  title?: string
  timestamp?: string | number

  userAgent?: string
  browser?: string
  os?: string
  device?: string
  screenResolution?: string
  viewport?: string
  language?: string
  timezone?: string
  connection?: string
  pixelRatio?: number
  cookieEnabled?: boolean
  doNotTrack?: boolean

  landingPage?: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmTerm?: string
  utmContent?: string
  source?: string
  medium?: string
  referrerDomain?: string
  isSearchEngine?: boolean
  searchEngine?: string
  socialNetwork?: string

  duration?: number
  pageViewCount?: number
  isBounce?: boolean

  eventType?: string
  eventName?: string
  properties?: Record<string, unknown>
}

export interface CollectResult {
  success: boolean
  id?: string
  excluded?: boolean
  error?: string
  updated?: boolean
}

export interface RequestContext {
  ipAddress: string
  headerUserAgent: string
  headers: Headers
}

/**
 * Build context + run bot/IP filters. Returns null if the request should be
 * silently rejected (bot, blocked IP). Caller returns 404 in that case.
 */
export function createRequestContext(req: Request): RequestContext | null {
  const ua = req.headers.get('user-agent')
  if (isBotRequest(ua)) {
    if (process.env.LOG_FILTERED_REQUESTS === '1') {
      console.log(`[ctx-filtered] reason=bot ua=${JSON.stringify(ua)}`)
    }
    return null
  }
  const ipAddress = getClientIp(req.headers)
  if (isIpBlocked(ipAddress)) {
    if (process.env.LOG_FILTERED_REQUESTS === '1') {
      console.log(`[ctx-filtered] reason=ip ip=${ipAddress}`)
    }
    return null
  }
  return {
    ipAddress,
    headerUserAgent: ua || 'unknown',
    headers: req.headers,
  }
}

/**
 * Rebuild a RequestContext from serialized header map — used by the worker
 * when consuming queued jobs (the original Request is long gone).
 */
export function createRequestContextFromHeaders(
  ipAddress: string,
  headerUserAgent: string,
  headerMap: Record<string, string | undefined>
): RequestContext {
  const headers = new Headers()
  for (const [k, v] of Object.entries(headerMap)) {
    if (v != null) headers.set(k, v)
  }
  return { ipAddress, headerUserAgent, headers }
}

const parseDate = (value?: string | number): string => {
  if (!value) return new Date().toISOString()
  const d = new Date(value)
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

export async function processEvent(
  payload: CollectPayload,
  ctx: RequestContext
): Promise<CollectResult> {
  const { type, trackingCode, sessionId } = payload
  let { visitorId } = payload

  if (!trackingCode || !visitorId || !sessionId) {
    return { success: false, error: 'Missing required fields' }
  }

  const website = await getActiveWebsiteByTrackingCode(trackingCode)
  if (!website) return { success: false, error: 'Invalid tracking code' }

  // Cookieless mode: ignore the client-supplied visitorId (which would have
  // been a fresh random per page load if the SDK skipped storage) and derive
  // a stable-per-day, per-website hash. Same UA+IP+website yields the same
  // visitorId for the day → same-day session continuity, no PII stored, and
  // the value rotates at midnight UTC so we never build a long-term profile.
  if (website.cookielessMode) {
    visitorId = await deriveCookielessVisitorId(
      website.id,
      ctx.ipAddress,
      payload.userAgent || ctx.headerUserAgent,
    )
  }

  const websiteId = website.id
  const geoData = await getGeoLocation(ctx.ipAddress, ctx.headers)

  const baseVisitor = {
    websiteId,
    visitorId,
    ipAddress: ctx.ipAddress,
    userAgent: payload.userAgent || ctx.headerUserAgent,
    browser: payload.browser,
    os: payload.os,
    device: normalizeDevice(payload.device) ?? undefined,
    screenResolution: payload.screenResolution,
    viewport: payload.viewport,
    language: payload.language,
    timezone: payload.timezone,
    connection: payload.connection,
    pixelRatio: payload.pixelRatio,
    cookieEnabled: payload.cookieEnabled,
    doNotTrack: payload.doNotTrack,
    country: geoData.country,
    state: geoData.regionName || geoData.region,
    city: geoData.city,
    lat: geoData.lat,
    lon: geoData.lon,
  }

  const baseSession = {
    websiteId,
    visitorId,
    sessionId,
    utmSource: payload.utmSource,
    utmMedium: payload.utmMedium,
    utmCampaign: payload.utmCampaign,
    utmTerm: payload.utmTerm,
    utmContent: payload.utmContent,
    source: payload.source,
    medium: payload.medium,
    referrerDomain: payload.referrerDomain,
    isSearchEngine: payload.isSearchEngine,
    searchEngine: payload.searchEngine,
    socialNetwork: payload.socialNetwork,
  }

  switch (type) {
    case 'pageview': {
      if (!payload.page) return { success: false, error: 'Missing page' }
      if (isPathExcluded(payload.page, website.excludedPaths)) {
        return { success: true, excluded: true }
      }

      const page = normalizeUrl(payload.page) || payload.page
      const referrer = normalizeUrl(payload.referrer) ?? payload.referrer

      await Promise.all([
        upsertVisitor(baseVisitor, true, false),
        upsertSession(
          { ...baseSession, referrer, landingPage: page, exitPage: page },
          true
        ),
      ])

      const [pv] = await db
        .insert(pageViews)
        .values({
          websiteId,
          visitorId,
          sessionId,
          page,
          title: payload.title,
          referrer,
          timestamp: parseDate(payload.timestamp),
        })
        .returning({ id: pageViews.id })

      if (isRedisConnected) {
        realtimeHelpers
          .markVisitorActive(websiteId, visitorId, {
            page,
            country: geoData.country ?? undefined,
            city: geoData.city ?? undefined,
            device: normalizeDevice(payload.device) ?? undefined,
            browser: payload.browser,
          })
          .catch((err) => console.error('Redis error:', err))
        realtimeHelpers
          .addLiveEvent(websiteId, {
            type: 'pageview',
            name: 'Page View',
            page,
            visitorId,
            timestamp: Date.now(),
          })
          .catch((err) => console.error('Redis error:', err))
      }

      return { success: true, id: pv?.id }
    }

    case 'event': {
      if (!payload.eventType || !payload.eventName || !payload.page) {
        return { success: false, error: 'Missing event fields' }
      }

      await Promise.all([
        upsertVisitor(baseVisitor),
        upsertSession({
          ...baseSession,
          referrer: payload.referrer,
          landingPage: payload.landingPage || payload.page,
        }),
      ])

      if (payload.eventType === 'performance' && payload.properties) {
        const props = payload.properties
        await db
          .insert(performanceMetrics)
          .values({
            websiteId,
            sessionId,
            page: (props.page as string) || payload.page,
            loadTime: Number(props.loadTime) || 0,
            domContentLoaded: Number(props.domContentLoaded) || 0,
            timeToInteractive: Number(props.timeToInteractive) || 0,
            firstPaint: props.firstPaint ? Number(props.firstPaint) : null,
            firstContentfulPaint: props.firstContentfulPaint
              ? Number(props.firstContentfulPaint)
              : null,
            navigationType: Number(props.navigationType) || 0,
            timestamp: parseDate(payload.timestamp),
          })
          .catch((err) => console.error('Performance metric error:', err))
      }

      const [evt] = await db
        .insert(events)
        .values({
          websiteId,
          visitorId,
          sessionId,
          eventType: payload.eventType,
          eventName: payload.eventName,
          page: payload.page,
          properties: payload.properties || {},
          timestamp: parseDate(payload.timestamp),
        })
        .returning({ id: events.id })

      if (isRedisConnected) {
        realtimeHelpers
          .addLiveEvent(websiteId, {
            type: payload.eventType,
            name: payload.eventName,
            page: payload.page,
            visitorId,
            timestamp: Date.now(),
            properties: payload.properties || {},
          })
          .catch((err) => console.error('Redis error:', err))
      }

      return { success: true, id: evt?.id }
    }

    case 'session': {
      await upsertVisitor(baseVisitor, false, true)

      if (
        payload.duration !== undefined ||
        payload.isBounce !== undefined ||
        payload.pageViewCount !== undefined
      ) {
        await updateSessionMetrics(websiteId, sessionId, {
          duration: payload.duration,
          pageViewCount: payload.pageViewCount,
          isBounce: payload.isBounce,
        })
        return { success: true, updated: true }
      }

      const session = await upsertSession({
        ...baseSession,
        referrer: payload.referrer,
        landingPage: payload.landingPage,
      })
      return { success: true, id: session?.id }
    }

    default:
      return { success: false, error: `Unknown event type: ${type}` }
  }
}

// isAbortLikeError lives in ./request-errors — re-export for convenience.
export { isAbortLikeError } from './request-errors'
