import { NextRequest, NextResponse } from 'next/server'
import { createRequestContext, processEvent } from '@/lib/collect'
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limiter'
import type { CollectPayload } from '@/lib/collect'
import { isAbortLikeError } from '@/lib/request-errors'
import { createClientClosedResponse } from '@/lib/tracking-response'
import { mapWithConcurrency } from '@/lib/promise-pool'
import { TRACKING_CONFIG } from '@/lib/tracking-config'
import { enqueueTrackingJob, serializeTrackingRequestContext } from '@/lib/tracking-queue'

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
    const requested = payloads.length
    const batch = payloads.slice(0, MAX_BATCH_SIZE)
    const truncated = requested > MAX_BATCH_SIZE
    const discarded = Math.max(0, requested - batch.length)
    let processed = 0
    let errors = 0

    try {
      await mapWithConcurrency(batch, TRACKING_CONFIG.batchConcurrency, async (payload) => {
        await enqueueTrackingJob({
          kind: 'collect',
          payload,
          context: serializeTrackingRequestContext(request.headers),
        })
        processed++
        return null
      })
    } catch (queueError) {
      console.error('Tracking batch enqueue failed, falling back to inline batch:', queueError)
      processed = 0
      errors = 0

      await mapWithConcurrency(batch, TRACKING_CONFIG.batchConcurrency, async (payload) => {
        try {
          const result = await processEvent(payload, ctx)
          if (result.success) processed++
          else errors++
        } catch {
          errors++
        }
        return null
      })
    }

    return NextResponse.json(
      {
        requested,
        processedBatchSize: batch.length,
        processed,
        errors,
        truncated,
        discarded,
        maxBatchSize: MAX_BATCH_SIZE,
      },
      { headers: corsHeaders }
    )
  } catch (error) {
    if (isAbortLikeError(error)) {
      return createClientClosedResponse(corsHeaders)
    }
    console.error('Error in /api/batch:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    )
  }
}
