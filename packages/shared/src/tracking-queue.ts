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

const TRACKING_QUEUE_KEY = 'tracking:jobs'

/**
 * Hard ceiling on queue depth — once exceeded, enqueue refuses so we don't
 * fill Dragonfly's RAM if the worker stalls. Caller decides fallback.
 */
export const TRACKING_QUEUE_MAX_DEPTH = Number(
  process.env.TRACKING_QUEUE_MAX_DEPTH ?? 100_000,
)

export class TrackingQueueFullError extends Error {
  readonly depth: number
  constructor(depth: number) {
    super(`tracking queue full: depth=${depth}`)
    this.name = 'TrackingQueueFullError'
    this.depth = depth
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
  // Check depth first; LLEN is O(1) on Redis/Dragonfly.
  const depth = await redis.llen(TRACKING_QUEUE_KEY)
  if (depth >= TRACKING_QUEUE_MAX_DEPTH) {
    throw new TrackingQueueFullError(depth)
  }
  await redis.lpush(TRACKING_QUEUE_KEY, JSON.stringify(job))
}

export async function dequeueTrackingJob(
  blockSeconds = 5,
): Promise<TrackingJob | null> {
  const result = await redis.brpop(TRACKING_QUEUE_KEY, blockSeconds)
  if (!result || result.length < 2 || !result[1]) return null
  return JSON.parse(result[1]) as TrackingJob
}

/**
 * Drain up to `max` additional jobs without blocking. Used after a blocking
 * BRPOP succeeds, so the worker can process the first job together with any
 * others already waiting in the queue. Uses the RPOP COUNT form (Redis 6.2+,
 * supported by Dragonfly) — a single round-trip regardless of `max`.
 */
export async function drainTrackingJobs(max: number): Promise<TrackingJob[]> {
  if (max <= 0) return []
  const raws = (await redis.rpop(TRACKING_QUEUE_KEY, max)) as string[] | null
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

export async function getTrackingQueueDepth(): Promise<number> {
  return redis.llen(TRACKING_QUEUE_KEY)
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

export function getTrackingQueueKey(): string {
  return TRACKING_QUEUE_KEY
}
