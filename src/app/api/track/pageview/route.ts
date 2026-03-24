import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { getGeoLocation } from '@/lib/geolocation'
import { getClientIp } from '@/lib/get-client-ip'
import { realtimeHelpers } from '@/lib/redis'
import { upsertVisitor, upsertSession } from '@/lib/tracking-helpers'
import { isBotRequest } from '@/lib/bot-detection'
import { isIpBlocked } from '@/lib/ip-filter'
import { normalizeUrl } from '@/lib/url-normalization'
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limiter'
import { isRedisConnected } from '@/lib/redis'
import { db } from '@/server/db/client'
import { websites, pageViews } from '@/server/db/schema'
import { eq, and } from 'drizzle-orm'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders })
}

export async function POST(request: NextRequest) {
  try {
    // Bot detection
    if (isBotRequest(request.headers.get('user-agent'))) {
      return NextResponse.json(null, { status: 404, headers: corsHeaders })
    }

    // IP blocking
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip') || 'unknown'
    if (isIpBlocked(clientIp)) {
      return NextResponse.json(null, { status: 404, headers: corsHeaders })
    }

    // Rate limiting
    const rateLimitKey = RATE_LIMITS.track.keyGenerator(request)
    const { allowed, remaining, resetTime } = await checkRateLimit(rateLimitKey, RATE_LIMITS.track)
    if (!allowed) {
      const retryAfter = Math.ceil((resetTime - Date.now()) / 1000)
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429, headers: { ...corsHeaders, 'Retry-After': retryAfter.toString() } }
      )
    }

    const body = await request.json()
    const {
      trackingCode,
      visitorId,
      sessionId,
      page,
      title,
      referrer,
      timestamp,
      userAgent,
      browser,
      os,
      device,
      screenResolution,
      viewport,
      language,
      timezone,
      connection,
      pixelRatio,
      cookieEnabled,
      doNotTrack
    } = body

    if (!trackingCode || !visitorId || !sessionId || !page) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400, headers: corsHeaders }
      )
    }

    const headersList = await headers()
    const ipAddress = getClientIp(headersList)
    const headerUserAgent = headersList.get('user-agent') || 'unknown'

    const websiteRows = await db
      .select({ id: websites.id })
      .from(websites)
      .where(and(eq(websites.trackingCode, trackingCode), eq(websites.status, 'ACTIVE')))
      .limit(1)

    if (websiteRows.length === 0) {
      return NextResponse.json(
        { error: 'Invalid tracking code' },
        { status: 404, headers: corsHeaders }
      )
    }

    const websiteId = websiteRows[0].id
    const normalizedPage = normalizeUrl(page) || page
    const normalizedReferrer = normalizeUrl(referrer) ?? referrer
    const geoData = await getGeoLocation(ipAddress, headersList as unknown as Headers)

    await upsertVisitor(
      {
        websiteId,
        visitorId,
        ipAddress,
        userAgent: userAgent || headerUserAgent,
        browser,
        os,
        device,
        screenResolution,
        viewport,
        language,
        timezone,
        connection,
        pixelRatio,
        cookieEnabled,
        doNotTrack,
        country: geoData.country,
        state: geoData.regionName || geoData.region,
        city: geoData.city,
        lat: geoData.lat,
        lon: geoData.lon,
      },
      true,
      false
    )

    await upsertSession(
      {
        websiteId,
        visitorId,
        sessionId,
        referrer: normalizedReferrer,
        landingPage: normalizedPage,
        exitPage: normalizedPage,
      },
      true
    )

    const [pageView] = await db
      .insert(pageViews)
      .values({
        websiteId,
        visitorId,
        sessionId,
        page: normalizedPage,
        title,
        referrer: normalizedReferrer,
        timestamp: timestamp ? new Date(timestamp).toISOString() : new Date().toISOString()
      })
      .returning({ id: pageViews.id })

    if (isRedisConnected) {
      realtimeHelpers.markVisitorActive(websiteId, visitorId, {
        page: normalizedPage,
        country: geoData.country ?? undefined,
        city: geoData.city ?? undefined,
        device,
        browser,
      }).catch((err) => console.error('Redis error:', err))

      realtimeHelpers.addLiveEvent(websiteId, {
        type: 'pageview',
        name: 'Page View',
        page: normalizedPage,
        visitorId,
        timestamp: Date.now(),
      }).catch((err) => console.error('Redis error:', err))
    }

    return NextResponse.json(
      { success: true, id: pageView?.id },
      { headers: corsHeaders }
    )
  } catch (error) {
    console.error('Error tracking page view:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    )
  }
}
