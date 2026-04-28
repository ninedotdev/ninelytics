/**
 * Legacy per-type tracking endpoints. /api/track/{pageview,event,session}
 * are thin wrappers over /api/collect with `type` injected.
 * /api/track/conversion runs the goal-matching pipeline.
 */
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
import { updateRealtimeFromCollect } from '@ninelytics/shared/realtime-collect'
import { getActiveWebsiteByTrackingCode } from '@ninelytics/shared/tracking-websites'
import {
  processConversionPayload,
  type ConversionPayload,
} from '@ninelytics/shared/tracking-conversion'
import { RATE_LIMITS } from '@ninelytics/shared/rate-limiter'
import { rateLimit } from '@/lib/rate-limit-mw'

export const track = new Hono()

track.options('/*', (c) => c.body(null, 200))

const trackLimiter = rateLimit(RATE_LIMITS.track!)

for (const [path, type] of [
  ['/pageview', 'pageview'],
  ['/event', 'event'],
  ['/session', 'session'],
] as const) {
  track.post(path, trackLimiter, async (c) => {
    try {
      const ctx = createRequestContext(c.req.raw)
      if (!ctx) return c.body(null, 404)

      const body = (await c.req.json()) as Partial<CollectPayload>
      const payload = { ...(body as CollectPayload), type }

      if (!payload.trackingCode) return c.json({ error: 'Missing trackingCode' }, 400)
      // Reject events for codes that don't resolve to an ACTIVE site.
      // Cached negatively in Redis (~1ms) so this is essentially free.
      const website = await getActiveWebsiteByTrackingCode(payload.trackingCode)
      if (!website) return c.body(null, 410)

      // Realtime ticker — fire-and-forget alongside the queue write.
      void updateRealtimeFromCollect(payload, ctx)

      try {
        await enqueueTrackingJob({
          kind: 'collect',
          payload,
          context: serializeTrackingRequestContext(ctx.headers, ctx.ipAddress),
        })
        return c.json({ success: true, queued: true })
      } catch (queueError) {
        if (queueError instanceof TrackingQueueFullError) {
          console.warn(
            `[track${path}] queue full (depth=${queueError.depth}), processing inline`,
          )
        } else {
          console.error(`Tracking enqueue ${path} failed, inline fallback:`, queueError)
        }
      }

      const result = await processEvent(payload, ctx)
      if (!result.success) return c.json({ error: result.error }, 400)
      return c.json(result)
    } catch (error) {
      if (isAbortLikeError(error)) return new Response(null, { status: 499 })
      console.error(`Error in /api/track${path}:`, error)
      return c.json({ error: 'Internal server error' }, 500)
    }
  })
}

track.post('/conversion', trackLimiter, async (c) => {
  try {
    const ctx = createRequestContext(c.req.raw)
    if (!ctx) return c.body(null, 404)

    const body = (await c.req.json()) as ConversionPayload
    if (!body.trackingCode || !body.visitorId || !body.sessionId) {
      return c.json({ error: 'Missing required fields' }, 400)
    }

    const website = await getActiveWebsiteByTrackingCode(body.trackingCode)
    if (!website) return c.body(null, 410)

    try {
      await enqueueTrackingJob({ kind: 'conversion', payload: body })
      return c.json({ success: true, queued: true })
    } catch (queueError) {
      if (queueError instanceof TrackingQueueFullError) {
        console.warn(
          `[track/conversion] queue full (depth=${queueError.depth}), processing inline`,
        )
      } else {
        console.error('Conversion enqueue failed, inline fallback:', queueError)
      }
    }

    const result = await processConversionPayload(body)
    if (!result.success) return c.json({ error: result.error }, 400)
    return c.json(result)
  } catch (error) {
    if (isAbortLikeError(error)) return new Response(null, { status: 499 })
    console.error('Error in /api/track/conversion:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})
