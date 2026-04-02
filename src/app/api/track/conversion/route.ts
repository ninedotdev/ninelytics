import { NextRequest, NextResponse } from 'next/server'
import { isBotRequest } from '@/lib/bot-detection'
import { isIpBlocked } from '@/lib/ip-filter'
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limiter'
import { isAbortLikeError } from '@/lib/request-errors'
import { createClientClosedResponse } from '@/lib/tracking-response'
import { enqueueTrackingJob } from '@/lib/tracking-queue'
import { processConversionPayload } from '@/lib/tracking-conversion'

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
    const payload = {
      trackingCode: body.trackingCode,
      visitorId: body.visitorId,
      sessionId: body.sessionId,
      page: body.page,
      eventName: body.eventName,
      duration: body.duration,
      value: body.value,
      metadata: body.metadata || {},
    }

    if (!payload.trackingCode || !payload.visitorId || !payload.sessionId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400, headers: corsHeaders }
      )
    }

    try {
      await enqueueTrackingJob({
        kind: 'conversion',
        payload,
      })

      return NextResponse.json(
        { success: true, queued: true },
        { headers: corsHeaders }
      )
    } catch (queueError) {
      console.error('Tracking conversion enqueue failed, falling back to inline processing:', queueError)
    }

    const result = await processConversionPayload(payload)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400, headers: corsHeaders }
      )
    }

    return NextResponse.json(result, { headers: corsHeaders })
  } catch (error) {
    if (isAbortLikeError(error)) {
      return createClientClosedResponse(corsHeaders)
    }
    console.error('Error tracking conversion:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    )
  }
}
