import { NextRequest, NextResponse } from 'next/server'
import { createRequestContext, processEvent } from '@/lib/collect'
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limiter'
import type { CollectPayload } from '@/lib/collect'

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
    const ctx = createRequestContext(request)
    if (!ctx) {
      return NextResponse.json(null, { status: 404, headers: corsHeaders })
    }

    // Rate limiting
    const rateLimitKey = RATE_LIMITS.track.keyGenerator(request)
    const { allowed, resetTime } = await checkRateLimit(rateLimitKey, RATE_LIMITS.track)
    if (!allowed) {
      const retryAfter = Math.ceil((resetTime - Date.now()) / 1000)
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429, headers: { ...corsHeaders, 'Retry-After': retryAfter.toString() } }
      )
    }

    const payload: CollectPayload = await request.json()

    if (!payload.type) {
      return NextResponse.json(
        { error: 'Missing event type' },
        { status: 400, headers: corsHeaders }
      )
    }

    const result = await processEvent(payload, ctx)

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400, headers: corsHeaders }
      )
    }

    return NextResponse.json(result, { headers: corsHeaders })
  } catch (error) {
    console.error('Error in /api/collect:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    )
  }
}
