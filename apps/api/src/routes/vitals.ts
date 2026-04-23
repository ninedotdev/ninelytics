import { Hono } from 'hono'
import {
  enqueueVitalsJob,
  VALID_VITALS,
  type VitalName,
  type VitalsJob,
} from '@ninelytics/shared/vitals-queue'

export const vitals = new Hono()

vitals.options('/', (c) => c.body(null, 200))

vitals.post('/', async (c) => {
  try {
    let body: Record<string, unknown>
    try {
      body = (await c.req.json()) as Record<string, unknown>
    } catch {
      return c.body(null, 400)
    }

    const { siteId, name, value, rating, path, deviceType, connectionType } = body

    if (!VALID_VITALS.includes(name as VitalName)) return c.body(null, 400)
    if (typeof value !== 'number' || !siteId || !path) return c.body(null, 400)

    // Sampling: ~10% of vitals, deterministic on value (no bias).
    if (Math.round(Number(value)) % 10 !== 0) return c.body(null, 202)

    const job: VitalsJob = {
      siteId: String(siteId),
      name: name as VitalName,
      value: Math.round(Number(value)),
      rating: String(rating ?? 'unknown'),
      path: String(path),
      deviceType: deviceType != null ? String(deviceType) : null,
      connectionType: connectionType != null ? String(connectionType) : null,
    }

    try {
      await enqueueVitalsJob(job)
    } catch (err) {
      // Drop silently on Redis failure — vitals are sampled + best-effort.
      console.error('[vitals] enqueue failed, dropping:', err)
    }

    return c.body(null, 202)
  } catch (error) {
    console.error('[vitals] Error:', error)
    return c.body(null, 500)
  }
})
