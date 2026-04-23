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

export const collect = new Hono()

collect.options('/', (c) => c.body(null, 200))

collect.post('/', rateLimit(RATE_LIMITS.track!), async (c) => {
  try {
    const ctx = createRequestContext(c.req.raw)
    if (!ctx) return c.body(null, 404)

    const payload = (await c.req.json()) as CollectPayload
    if (!payload.type) return c.json({ error: 'Missing event type' }, 400)

    // Queue-first: return immediately, worker handles DB writes.
    // Inline fallback if Redis is down so we never silently lose events.
    try {
      await enqueueTrackingJob({
        kind: 'collect',
        payload,
        context: serializeTrackingRequestContext(ctx.headers, ctx.ipAddress),
      })
      return c.json({ success: true, queued: true })
    } catch (queueError) {
      if (queueError instanceof TrackingQueueFullError) {
        console.warn(`[collect] queue full (depth=${queueError.depth}), processing inline`)
      } else {
        console.error('Tracking queue enqueue failed, falling back inline:', queueError)
      }
    }

    const result = await processEvent(payload, ctx)
    if (!result.success) return c.json({ error: result.error }, 400)
    return c.json(result)
  } catch (error) {
    if (isAbortLikeError(error)) return new Response(null, { status: 499 })
    console.error('Error in /api/collect:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})
