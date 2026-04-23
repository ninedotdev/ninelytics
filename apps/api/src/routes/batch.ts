import { Hono } from 'hono'
import {
  createRequestContext,
  processEvent,
  isAbortLikeError,
  type CollectPayload,
} from '@ninelytics/shared/collect'
import {
  enqueueTrackingJob,
  serializeTrackingRequestContext,
  TrackingQueueFullError,
} from '@ninelytics/shared/tracking-queue'
import { RATE_LIMITS } from '@ninelytics/shared/rate-limiter'
import { rateLimit } from '@/lib/rate-limit-mw'

const MAX_BATCH_SIZE = 25

export const batch = new Hono()

batch.options('/', (c) => c.body(null, 200))

batch.post('/', rateLimit(RATE_LIMITS.track!), async (c) => {
  try {
    const ctx = createRequestContext(c.req.raw)
    if (!ctx) return c.body(null, 404)

    const body = await c.req.json()
    const raw: CollectPayload[] = Array.isArray(body) ? body : body.events
    if (!Array.isArray(raw) || raw.length === 0) {
      return c.json({ error: 'Expected array of events' }, 400)
    }

    const requested = raw.length
    const events = raw.slice(0, MAX_BATCH_SIZE)
    const truncated = requested > MAX_BATCH_SIZE

    let processed = 0
    let errors = 0

    // Queue-first path.
    try {
      const serCtx = serializeTrackingRequestContext(ctx.headers, ctx.ipAddress)
      await Promise.all(
        events.map((payload) =>
          enqueueTrackingJob({ kind: 'collect', payload, context: serCtx })
        )
      )
      processed = events.length
    } catch (queueError) {
      if (queueError instanceof TrackingQueueFullError) {
        console.warn(
          `[batch] queue full (depth=${queueError.depth}), processing ${events.length} inline`,
        )
      } else {
        console.error('Tracking batch enqueue failed, falling back inline:', queueError)
      }
      processed = 0
      const results = await Promise.allSettled(
        events.map((payload) => processEvent(payload, ctx))
      )
      for (const r of results) {
        if (r.status === 'fulfilled' && r.value.success) processed++
        else errors++
      }
    }

    return c.json({
      requested,
      processedBatchSize: events.length,
      processed,
      errors,
      truncated,
      discarded: Math.max(0, requested - events.length),
      maxBatchSize: MAX_BATCH_SIZE,
    })
  } catch (error) {
    if (isAbortLikeError(error)) return new Response(null, { status: 499 })
    console.error('Error in /api/batch:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})
