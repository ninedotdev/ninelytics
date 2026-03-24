import { NextRequest, NextResponse } from 'next/server'
import { createRequestContext, processEvent } from '@/lib/collect'
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limiter'
import type { CollectPayload, CollectResult } from '@/lib/collect'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

const MAX_BATCH_SIZE = 25

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

    const body = await request.json()
    const payloads: CollectPayload[] = Array.isArray(body) ? body : body.events

    if (!Array.isArray(payloads) || payloads.length === 0) {
      return NextResponse.json(
        { error: 'Expected array of events' },
        { status: 400, headers: corsHeaders }
      )
    }

    // Cap batch size to prevent abuse
    const batch = payloads.slice(0, MAX_BATCH_SIZE)
    const results: CollectResult[] = []
    let processed = 0
    let errors = 0

    for (const payload of batch) {
      try {
        const result = await processEvent(payload, ctx)
        results.push(result)
        if (result.success) processed++
        else errors++
      } catch (err) {
        errors++
        results.push({ success: false, error: 'Processing failed' })
      }
    }

    return NextResponse.json(
      { size: batch.length, processed, errors },
      { headers: corsHeaders }
    )
  } catch (error) {
    console.error('Error in /api/batch:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    )
  }
}
