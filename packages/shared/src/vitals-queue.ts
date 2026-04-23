/**
 * Web Vitals queue — separate from the tracking queue because vitals come
 * in bursts at session end and are a clean bulk-insert (no upserts, no geo).
 */
import { redis } from './redis'
import { db } from './db'
import { webVitals, websites } from '@ninelytics/db/schema'
import { eq, and, inArray } from 'drizzle-orm'

const VITALS_QUEUE_KEY = 'vitals:jobs'

export const VITALS_QUEUE_MAX_DEPTH = Number(
  process.env.VITALS_QUEUE_MAX_DEPTH ?? 50_000,
)

export const VALID_VITALS = ['LCP', 'FCP', 'INP', 'CLS', 'TTFB'] as const
export type VitalName = (typeof VALID_VITALS)[number]

export interface VitalsJob {
  siteId: string
  name: VitalName
  value: number
  rating: string
  path: string
  deviceType?: string | null
  connectionType?: string | null
}

export async function enqueueVitalsJob(job: VitalsJob): Promise<void> {
  const depth = await redis.llen(VITALS_QUEUE_KEY)
  // Vitals are sampled + best-effort: drop silently when full.
  if (depth >= VITALS_QUEUE_MAX_DEPTH) return
  await redis.lpush(VITALS_QUEUE_KEY, JSON.stringify(job))
}

export async function dequeueVitalsJob(
  blockSeconds = 5,
): Promise<VitalsJob | null> {
  const result = await redis.brpop(VITALS_QUEUE_KEY, blockSeconds)
  if (!result || result.length < 2 || !result[1]) return null
  return JSON.parse(result[1]) as VitalsJob
}

export async function drainVitalsJobs(max: number): Promise<VitalsJob[]> {
  if (max <= 0) return []
  const raws = (await redis.rpop(VITALS_QUEUE_KEY, max)) as string[] | null
  if (!raws || raws.length === 0) return []
  const out: VitalsJob[] = []
  for (const raw of raws) {
    try {
      out.push(JSON.parse(raw) as VitalsJob)
    } catch (err) {
      console.error('[vitals-queue] parse failed, dropping:', err)
    }
  }
  return out
}

export async function getVitalsQueueDepth(): Promise<number> {
  return redis.llen(VITALS_QUEUE_KEY)
}

export function getVitalsQueueKey(): string {
  return VITALS_QUEUE_KEY
}

/**
 * Resolve tracking-codes → website ids in one query, then bulk-insert the
 * vitals that belong to websites with speedInsightsEnabled=true.
 */
export async function processVitalsBatch(batch: VitalsJob[]): Promise<void> {
  if (batch.length === 0) return

  const codes = [...new Set(batch.map((j) => j.siteId))]
  const sites = await db
    .select({
      id: websites.id,
      trackingCode: websites.trackingCode,
      speedInsightsEnabled: websites.speedInsightsEnabled,
    })
    .from(websites)
    .where(
      and(eq(websites.status, 'ACTIVE'), inArray(websites.trackingCode, codes)),
    )

  const byCode = new Map<string, { id: string; enabled: boolean }>()
  for (const s of sites) {
    byCode.set(s.trackingCode, { id: s.id, enabled: !!s.speedInsightsEnabled })
  }

  const rows = batch
    .map((j) => {
      const site = byCode.get(j.siteId)
      if (!site || !site.enabled) return null
      return {
        websiteId: site.id,
        name: String(j.name),
        value: Math.round(Number(j.value)),
        rating: String(j.rating ?? 'unknown'),
        path: String(j.path),
        deviceType: j.deviceType ? String(j.deviceType) : null,
        connectionType: j.connectionType ? String(j.connectionType) : null,
      }
    })
    .filter((r): r is NonNullable<typeof r> => r !== null)

  if (rows.length === 0) return
  await db.insert(webVitals).values(rows)
}
