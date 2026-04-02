import { NextRequest, NextResponse } from 'next/server'
import { isBotRequest } from '@/lib/bot-detection'
import { createRequestContext, processEvent, type CollectPayload } from '@/lib/collect'
import { isIpBlocked } from '@/lib/ip-filter'
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limiter'
import { isAbortLikeError } from '@/lib/request-errors'
import { createClientClosedResponse } from '@/lib/tracking-response'
import { enqueueTrackingJob, serializeTrackingRequestContext } from '@/lib/tracking-queue'

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
    if (isBotRequest(request.headers.get('user-agent'))) {
      return NextResponse.json(null, { status: 404, headers: corsHeaders })
    }

    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip') || 'unknown'
    if (isIpBlocked(clientIp)) {
      return NextResponse.json(null, { status: 404, headers: corsHeaders })
    }

    const rateLimitKey = RATE_LIMITS.track.keyGenerator(request)
    const { allowed, resetTime } = await checkRateLimit(rateLimitKey, RATE_LIMITS.track)
    if (!allowed) {
      const retryAfter = Math.ceil((resetTime - Date.now()) / 1000)
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429, headers: { ...corsHeaders, 'Retry-After': retryAfter.toString() } }
      )
    }

    const body = await request.json()
    const payload: CollectPayload = {
      type: 'event',
      trackingCode: body.trackingCode,
      visitorId: body.visitorId,
      sessionId: body.sessionId,
      eventType: body.eventType,
      eventName: body.eventName,
      page: body.page,
      properties: body.properties,
      timestamp: body.timestamp,
      referrer: body.referrer,
      landingPage: body.landingPage || body.page,
      userAgent: body.userAgent,
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
    }

    if (!payload.trackingCode || !payload.visitorId || !payload.sessionId || !payload.eventType || !payload.eventName || !payload.page) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400, headers: corsHeaders }
      )
    }

    try {
      await enqueueTrackingJob({
        kind: 'collect',
        payload,
        context: serializeTrackingRequestContext(request.headers),
      })

      return NextResponse.json(
        { success: true, queued: true },
        { headers: corsHeaders }
      )
    } catch (queueError) {
      console.error('Tracking event enqueue failed, falling back to inline processing:', queueError)
    }

    const ctx = createRequestContext(request)
    if (!ctx) {
      return NextResponse.json(null, { status: 404, headers: corsHeaders })
    }

    const result = await processEvent(payload, ctx)
    if (!result.success) {
      return NextResponse.json(
        { error: result.error ?? 'Internal server error' },
        { status: 400, headers: corsHeaders }
      )
    }

    return NextResponse.json(
      { success: true, id: result.id, updated: result.updated },
      { headers: corsHeaders }
    )
  } catch (error) {
    if (isAbortLikeError(error)) {
      return createClientClosedResponse(corsHeaders)
    }
    console.error('Error tracking event:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    )
  }
}
