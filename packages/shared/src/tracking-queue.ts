import { redis } from './redis'
import {
  createRequestContextFromHeaders,
  processEvent,
  type CollectPayload,
} from './collect'
import {
  processConversionPayload,
  type ConversionPayload,
} from './tracking-conversion'

/**
 * Number of FIFO shards to spread tracking jobs across. We hash by the
 * site's trackingCode so events from one website always land in the same
 * shard (preserves per-session ordering needed for bounce / duration math),
 * but distribute across shards so a high-traffic site can't head-of-line
 * block low-traffic sites.
 *
 * Hardened against bad env values: empty string, "abc", or 0 would
 * otherwise produce `NaN` shards and route every event into a key no
 * consumer reads from (silent data loss).
 */
function parseShardCount(): number {
  const raw = process.env.TRACKING_QUEUE_SHARDS
  if (raw == null || raw === '') return 4
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 1) return 4
  return Math.floor(n)
}
const SHARD_COUNT = parseShardCount()

/** Legacy single-queue key, kept so the worker can drain leftovers from a deploy. */
const LEGACY_QUEUE_KEY = 'tracking:jobs'

const SHARD_KEY_PREFIX = 'tracking:jobs:'

export function getShardKey(shard: number): string {
  return `${SHARD_KEY_PREFIX}${shard}`
}

export function getShardCount(): number {
  return SHARD_COUNT
}

export function getLegacyQueueKey(): string {
  return LEGACY_QUEUE_KEY
}

/** FNV-1a 32-bit, deterministic and dependency-free. */
function fnv1a(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

/** Pick a shard from the job's tracking code. Falls back to shard 0 if missing. */
export function shardForJob(job: TrackingJob): number {
  const code =
    job.kind === 'collect' ? job.payload.trackingCode : job.payload.trackingCode
  if (!code) return 0
  // Defensive: SHARD_COUNT is always >= 1 thanks to parseShardCount, but
  // double-check so we never produce NaN (which would route to a key no
  // consumer reads from).
  const n = SHARD_COUNT > 0 ? SHARD_COUNT : 4
  return fnv1a(code) % n
}

/**
 * Hard ceiling on queue depth (per shard) — once exceeded, enqueue refuses
 * so we don't fill Dragonfly's RAM if a worker stalls. Caller decides fallback.
 */
export const TRACKING_QUEUE_MAX_DEPTH = Number(
  process.env.TRACKING_QUEUE_MAX_DEPTH ?? 100_000,
)

export class TrackingQueueFullError extends Error {
  readonly depth: number
  readonly shard: number
  constructor(depth: number, shard: number) {
    super(`tracking queue shard ${shard} full: depth=${depth}`)
    this.name = 'TrackingQueueFullError'
    this.depth = depth
    this.shard = shard
  }
}

/** Headers worth forwarding to the worker (geo providers set them). */
const GEO_HEADER_NAMES = [
  'cf-ipcountry',
  'cf-region-code',
  'cf-ipcity',
  'x-vercel-ip-country',
  'x-vercel-ip-country-region',
  'x-vercel-ip-city',
  'cloudfront-viewer-country',
  'cloudfront-viewer-country-region',
  'cloudfront-viewer-city',
] as const

export interface SerializedRequestContext {
  ipAddress: string
  headerUserAgent: string
  headers: Record<string, string>
}

export type TrackingJob =
  | { kind: 'collect'; payload: CollectPayload; context: SerializedRequestContext }
  | { kind: 'conversion'; payload: ConversionPayload }

export function serializeTrackingRequestContext(
  headers: Headers,
  ipAddress: string,
): SerializedRequestContext {
  const serialized: Record<string, string> = {}
  for (const name of GEO_HEADER_NAMES) {
    const v = headers.get(name)
    if (v) serialized[name] = v
  }
  return {
    ipAddress,
    headerUserAgent: headers.get('user-agent') || 'unknown',
    headers: serialized,
  }
}

export async function enqueueTrackingJob(job: TrackingJob): Promise<void> {
  const shard = shardForJob(job)
  const key = getShardKey(shard)
  // Per-shard depth check; LLEN is O(1) on Redis/Dragonfly.
  const depth = await redis.llen(key)
  if (depth >= TRACKING_QUEUE_MAX_DEPTH) {
    throw new TrackingQueueFullError(depth, shard)
  }
  await redis.lpush(key, JSON.stringify(job))
}

/**
 * Block on a single shard. Each worker loop owns one shard so consumers
 * don't compete on the same key.
 */
export async function dequeueTrackingJob(
  shardOrKey: number | string,
  blockSeconds = 5,
): Promise<TrackingJob | null> {
  const key = typeof shardOrKey === 'number' ? getShardKey(shardOrKey) : shardOrKey
  const result = await redis.brpop(key, blockSeconds)
  if (!result || result.length < 2 || !result[1]) return null
  return JSON.parse(result[1]) as TrackingJob
}

/**
 * Drain up to `max` additional jobs from a shard without blocking. Used
 * after a blocking BRPOP succeeds so the consumer can process the first job
 * together with any others already waiting. RPOP COUNT (Redis 6.2+,
 * supported by Dragonfly) — single round-trip.
 */
export async function drainTrackingJobs(
  shardOrKey: number | string,
  max: number,
): Promise<TrackingJob[]> {
  if (max <= 0) return []
  const key = typeof shardOrKey === 'number' ? getShardKey(shardOrKey) : shardOrKey
  const raws = (await redis.rpop(key, max)) as string[] | null
  if (!raws || raws.length === 0) return []
  const jobs: TrackingJob[] = []
  for (const raw of raws) {
    try {
      jobs.push(JSON.parse(raw) as TrackingJob)
    } catch (err) {
      console.error('[tracking-queue] failed to parse job, dropping:', err)
    }
  }
  return jobs
}

/** Sum across all shards (and the legacy key, in case a deploy left some). */
export async function getTrackingQueueDepth(): Promise<number> {
  const keys = [LEGACY_QUEUE_KEY, ...Array.from({ length: SHARD_COUNT }, (_, i) => getShardKey(i))]
  const lens = await Promise.all(keys.map((k) => redis.llen(k)))
  return lens.reduce((a, b) => a + b, 0)
}

export async function processTrackingJob(job: TrackingJob) {
  if (job.kind === 'collect') {
    const ctx = createRequestContextFromHeaders(
      job.context.ipAddress,
      job.context.headerUserAgent,
      job.context.headers,
    )
    return processEvent(job.payload, ctx)
  }
  return processConversionPayload(job.payload)
}

/** Display key for logs — reports all shards. */
export function getTrackingQueueKey(): string {
  return `${SHARD_KEY_PREFIX}{0..${SHARD_COUNT - 1}}`
}
