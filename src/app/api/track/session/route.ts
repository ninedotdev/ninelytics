import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { getGeoLocation } from '@/lib/geolocation'
import { getClientIp } from '@/lib/get-client-ip'
import { upsertVisitor, upsertSession } from '@/lib/tracking-helpers'
import { isBotRequest } from '@/lib/bot-detection'
import { isIpBlocked } from '@/lib/ip-filter'
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limiter'
import { db } from '@/server/db/client'
import { websites, visitorSessions } from '@/server/db/schema'
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
      referrer,
      landingPage,
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
      doNotTrack,
      utmSource,
      utmMedium,
      utmCampaign,
      utmTerm,
      utmContent,
      source,
      medium,
      referrerDomain,
      isSearchEngine,
      searchEngine,
      socialNetwork,
      duration,
      pageViewCount,
      isBounce
    } = body

    if (!trackingCode || !visitorId || !sessionId) {
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
      false,
      true
    )

    if (duration !== undefined || isBounce !== undefined || pageViewCount !== undefined) {
      await db
        .update(visitorSessions)
        .set({
          duration: duration ?? 0,
          pageViewCount: pageViewCount ?? 1,
          isBounce: isBounce !== undefined ? isBounce : (pageViewCount === 1),
          endTime: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .where(and(
          eq(visitorSessions.sessionId, sessionId),
          eq(visitorSessions.websiteId, websiteId)
        ))

      return NextResponse.json(
        { success: true, updated: true },
        { headers: corsHeaders }
      )
    }

    const session = await upsertSession({
      websiteId,
      visitorId,
      sessionId,
      referrer,
      landingPage,
      utmSource,
      utmMedium,
      utmCampaign,
      utmTerm,
      utmContent,
      source,
      medium,
      referrerDomain,
      isSearchEngine,
      searchEngine,
      socialNetwork,
    })

    return NextResponse.json(
      { success: true, id: session?.id },
      { headers: corsHeaders }
    )
  } catch (error) {
    console.error('Error tracking session:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    )
  }
}
