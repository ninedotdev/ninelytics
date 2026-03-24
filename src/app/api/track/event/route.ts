import { NextRequest, NextResponse } from 'next/server'
import { realtimeHelpers } from '@/lib/redis'
import { upsertVisitor, upsertSession } from '@/lib/tracking-helpers'
import { getClientIp } from '@/lib/get-client-ip'
import { isBotRequest } from '@/lib/bot-detection'
import { isIpBlocked } from '@/lib/ip-filter'
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limiter'
import { db } from '@/server/db/client'
import { websites, events, performanceMetrics } from '@/server/db/schema'
import { eq, and } from 'drizzle-orm'
import { eventQueue } from '@/lib/event-queue'

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
      eventType,
      eventName,
      page,
      properties,
      timestamp
    } = body

    if (!trackingCode || !visitorId || !sessionId || !eventType || !eventName || !page) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400, headers: corsHeaders }
      )
    }

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

    await upsertVisitor({
      websiteId,
      visitorId,
      ipAddress: getClientIp(request.headers),
      userAgent: request.headers.get('user-agent') || 'Unknown',
      browser: body.browser,
      os: body.os,
      device: body.device,
      screenResolution: body.screenResolution,
      viewport: body.viewport,
      language: body.language,
      timezone: body.timezone,
      connection: body.connection,
      pixelRatio: body.pixelRatio,
      cookieEnabled: body.cookieEnabled,
      doNotTrack: body.doNotTrack,
      country: body.country,
      state: body.state,
      city: body.city,
    })

    await upsertSession({
      websiteId,
      visitorId,
      sessionId,
      referrer: body.referrer,
      landingPage: body.landingPage || page,
      utmSource: body.utmSource,
      utmMedium: body.utmMedium,
      utmCampaign: body.utmCampaign,
      utmTerm: body.utmTerm,
      utmContent: body.utmContent,
      source: body.source,
      medium: body.medium,
      referrerDomain: body.referrerDomain,
      isSearchEngine: body.isSearchEngine,
      searchEngine: body.searchEngine,
      socialNetwork: body.socialNetwork,
    })

    if (eventType === 'performance' && properties) {
      try {
        await db.insert(performanceMetrics).values({
          websiteId,
          sessionId,
          page: properties.page || page,
          loadTime: properties.loadTime || 0,
          domContentLoaded: properties.domContentLoaded || 0,
          timeToInteractive: properties.timeToInteractive || 0,
          firstPaint: properties.firstPaint || null,
          firstContentfulPaint: properties.firstContentfulPaint || null,
          navigationType: properties.navigationType || 0,
          timestamp: timestamp ? new Date(timestamp).toISOString() : new Date().toISOString()
        })
      } catch (error) {
        console.error('Error saving performance metric:', error)
      }
    }

    let event
    try {
      const [inserted] = await db
        .insert(events)
        .values({
          websiteId,
          visitorId,
          sessionId,
          eventType,
          eventName,
          page,
          properties: properties || {},
          timestamp: timestamp ? new Date(timestamp).toISOString() : new Date().toISOString()
        })
        .returning({ id: events.id })

      event = inserted
    } catch (error) {
      console.warn('Event creation failed, adding to queue:', error)
      await eventQueue.addEvent({
        websiteId,
        visitorId,
        sessionId,
        eventType,
        eventName,
        page,
        properties: properties || {},
        timestamp: timestamp ? new Date(timestamp).toISOString() : new Date().toISOString()
      })

      return NextResponse.json(
        { success: true, queued: true, message: 'Event queued for processing' },
        { headers: corsHeaders }
      )
    }

    realtimeHelpers.addLiveEvent(websiteId, {
      type: eventType,
      name: eventName,
      page,
      visitorId,
      timestamp: Date.now(),
      properties: properties || {},
    }).catch((err) => console.error('Redis error:', err))

    return NextResponse.json(
      { success: true, id: event?.id },
      { headers: corsHeaders }
    )
  } catch (error) {
    console.error('Error tracking event:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    )
  }
}
