/**
 * Unified collection logic for tracking endpoints.
 * Centralizes: website validation, bot detection, IP filtering, rate limiting,
 * geolocation, visitor/session upsert.
 *
 * Used by /api/collect (unified) and /api/batch (batch) endpoints.
 */

import { NextRequest } from 'next/server'
import { eq, and } from 'drizzle-orm'
import { db } from '@/server/db/client'
import { websites, pageViews, events, performanceMetrics } from '@/server/db/schema'
import { isBotRequest } from '@/lib/bot-detection'
import { isIpBlocked } from '@/lib/ip-filter'
import { normalizeUrl } from '@/lib/url-normalization'
import { getGeoLocation } from '@/lib/geolocation'
import { upsertVisitor, upsertSession, updateSessionMetrics } from '@/lib/tracking-helpers'
import { realtimeHelpers, isRedisConnected } from '@/lib/redis'
import { isPathExcluded } from '@/lib/path-exclusions'
import { getActiveWebsiteByTrackingCode } from '@/lib/tracking-websites'

export interface CollectPayload {
  type: 'pageview' | 'event' | 'session'
  trackingCode: string
  visitorId: string
  sessionId: string

  // Common
  page?: string
  referrer?: string
  title?: string
  timestamp?: string | number

  // Visitor fields
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

  // Session/UTM fields
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

  // Session end fields
  duration?: number
  pageViewCount?: number
  isBounce?: boolean

  // Event fields
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

function getRequestContext(request: NextRequest): RequestContext {
  const ipAddress = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown'
  const headerUserAgent = request.headers.get('user-agent') || 'unknown'

  return { ipAddress, headerUserAgent, headers: request.headers }
}

export function createRequestContextFromHeaders(
  ipAddress: string,
  headerUserAgent: string,
  headerMap: Record<string, string | undefined>
): RequestContext {
  const headers = new Headers()

  for (const [key, value] of Object.entries(headerMap)) {
    if (value != null) {
      headers.set(key, value)
    }
  }

  return { ipAddress, headerUserAgent, headers }
}

const parseDate = (value?: string | number): string => {
  if (!value) return new Date().toISOString()
  const d = new Date(value)
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

/**
 * Process a single tracking event through the unified pipeline.
 */
export async function processEvent(
  payload: CollectPayload,
  ctx: RequestContext
): Promise<CollectResult> {
  const { type, trackingCode, visitorId, sessionId } = payload

  if (!trackingCode || !visitorId || !sessionId) {
    return { success: false, error: 'Missing required fields' }
  }

  const website = await getActiveWebsiteByTrackingCode(trackingCode)
  if (!website) {
    return { success: false, error: 'Invalid tracking code' }
  }

  const websiteId = website.id
  const geoData = await getGeoLocation(ctx.ipAddress, ctx.headers)

  switch (type) {
    case 'pageview': {
      if (!payload.page) return { success: false, error: 'Missing page' }

      if (isPathExcluded(payload.page, website.excludedPaths)) {
        return { success: true, excluded: true }
      }

      const page = normalizeUrl(payload.page) || payload.page
      const referrer = normalizeUrl(payload.referrer) ?? payload.referrer

      await Promise.all([
        upsertVisitor({
          websiteId,
          visitorId,
          ipAddress: ctx.ipAddress,
          userAgent: payload.userAgent || ctx.headerUserAgent,
          browser: payload.browser,
          os: payload.os,
          device: payload.device,
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
        }, true, false),
        upsertSession({
          websiteId,
          visitorId,
          sessionId,
          referrer,
          landingPage: page,
          exitPage: page,
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
        }, true),
      ])

      const [pv] = await db.insert(pageViews).values({
        websiteId,
        visitorId,
        sessionId,
        page,
        title: payload.title,
        referrer,
        timestamp: parseDate(payload.timestamp),
      }).returning({ id: pageViews.id })

      if (isRedisConnected) {
        realtimeHelpers.markVisitorActive(websiteId, visitorId, {
          page,
          country: geoData.country ?? undefined,
          city: geoData.city ?? undefined,
          device: payload.device,
          browser: payload.browser,
        }).catch((err) => console.error('Redis error:', err))

        realtimeHelpers.addLiveEvent(websiteId, {
          type: 'pageview',
          name: 'Page View',
          page,
          visitorId,
          timestamp: Date.now(),
        }).catch((err) => console.error('Redis error:', err))
      }

      return { success: true, id: pv?.id }
    }

    case 'event': {
      if (!payload.eventType || !payload.eventName || !payload.page) {
        return { success: false, error: 'Missing event fields' }
      }

      await Promise.all([
        upsertVisitor({
          websiteId,
          visitorId,
          ipAddress: ctx.ipAddress,
          userAgent: payload.userAgent || ctx.headerUserAgent,
          browser: payload.browser,
          os: payload.os,
          device: payload.device,
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
        }),
        upsertSession({
          websiteId,
          visitorId,
          sessionId,
          referrer: payload.referrer,
          landingPage: payload.landingPage || payload.page,
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
        }),
      ])

      if (payload.eventType === 'performance' && payload.properties) {
        const props = payload.properties
        await db.insert(performanceMetrics).values({
          websiteId,
          sessionId,
          page: (props.page as string) || payload.page,
          loadTime: Number(props.loadTime) || 0,
          domContentLoaded: Number(props.domContentLoaded) || 0,
          timeToInteractive: Number(props.timeToInteractive) || 0,
          firstPaint: props.firstPaint ? Number(props.firstPaint) : null,
          firstContentfulPaint: props.firstContentfulPaint ? Number(props.firstContentfulPaint) : null,
          navigationType: Number(props.navigationType) || 0,
          timestamp: parseDate(payload.timestamp),
        }).catch((err) => console.error('Performance metric error:', err))
      }

      const [evt] = await db.insert(events).values({
        websiteId,
        visitorId,
        sessionId,
        eventType: payload.eventType,
        eventName: payload.eventName,
        page: payload.page,
        properties: payload.properties || {},
        timestamp: parseDate(payload.timestamp),
      }).returning({ id: events.id })

      if (isRedisConnected) {
        realtimeHelpers.addLiveEvent(websiteId, {
          type: payload.eventType,
          name: payload.eventName,
          page: payload.page,
          visitorId,
          timestamp: Date.now(),
          properties: payload.properties || {},
        }).catch((err) => console.error('Redis error:', err))
      }

      return { success: true, id: evt?.id }
    }

    case 'session': {
      await upsertVisitor({
        websiteId,
        visitorId,
        ipAddress: ctx.ipAddress,
        userAgent: payload.userAgent || ctx.headerUserAgent,
        browser: payload.browser,
        os: payload.os,
        device: payload.device,
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
      }, false, true)

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
        websiteId,
        visitorId,
        sessionId,
        referrer: payload.referrer,
        landingPage: payload.landingPage,
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
      })

      return { success: true, id: session?.id }
    }

    default:
      return { success: false, error: `Unknown event type: ${type}` }
  }
}

/**
 * Run the full pre-processing pipeline (bot check, IP filter, rate limit)
 * and return a context object or null if blocked.
 */
export function createRequestContext(request: NextRequest): RequestContext | null {
  // Bot detection
  if (isBotRequest(request.headers.get('user-agent'))) {
    return null
  }

  const ctx = getRequestContext(request)

  // IP blocking
  if (isIpBlocked(ctx.ipAddress)) {
    return null
  }

  return ctx
}
