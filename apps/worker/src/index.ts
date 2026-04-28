/**
 * Worker process. Responsibilities:
 *   1. Consume the tracking queue (pageview/event/session/conversion)
 *   2. Consume the workflow queue (ad-hoc uptime-check, sitemap-poll
 *      triggered by the dashboard)
 *   3. Scheduler: periodic uptime scan (5m) and sitemap auto-index (6h)
 *
 * Shutdown: on SIGINT/SIGTERM stop all loops, close Redis cleanly.
 */
import { redis } from '@ninelytics/shared/redis'
import {
  dequeueTrackingJob,
  drainTrackingJobs,
  getLegacyQueueKey,
  getShardCount,
  getTrackingQueueKey,
  processTrackingJob,
  type TrackingJob,
} from '@ninelytics/shared/tracking-queue'
import { mapWithConcurrency } from '@ninelytics/shared/promise-pool'
import {
  dequeueVitalsJob,
  drainVitalsJobs,
  getVitalsQueueKey,
  processVitalsBatch,
  type VitalsJob,
} from '@ninelytics/shared/vitals-queue'
import {
  dequeueWorkflowJob,
  getWorkflowQueueKey,
  type WorkflowJob,
} from '@ninelytics/shared/workflow-queue'
import { runUptimeCheckForSite } from '@/workflows/uptime'
import { runSitemapPollForSite } from '@/workflows/sitemap'
import { runWebsitePurge } from '@/workflows/website-purge'
import {
  startDailyStatsFlusher,
  stopDailyStatsFlusher,
  flushDailyStats,
} from '@ninelytics/shared/daily-stats'
import { startScheduler, stopScheduler } from '@/scheduler'

const TRACKING_BATCH_SIZE = Number(process.env.TRACKING_BATCH_SIZE ?? 50)
const VITALS_BATCH_SIZE = Number(process.env.VITALS_BATCH_SIZE ?? 200)
/**
 * Cap concurrent in-flight DB ops per shard. Each tracking job does 2-3 DB
 * calls (upsert visitor + upsert session + insert pageview). With N shards
 * × this concurrency × ~3 calls, we want to stay well under PgBouncer's
 * DEFAULT_POOL_SIZE so we don't sit on a connection wait queue.
 */
const TRACKING_CONCURRENCY = Number(process.env.TRACKING_CONCURRENCY ?? 8)

let running = true

process.on('uncaughtException', (err) => {
  console.error('[FATAL] uncaughtException:', err.stack ?? err)
})
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] unhandledRejection:', reason)
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, () => {
    if (!running) return
    console.log(`[worker] ${signal} received, draining…`)
    running = false
    stopScheduler()
    stopDailyStatsFlusher()
    // Best-effort: flush whatever's pending so we don't lose recent counts.
    void flushDailyStats().catch(() => undefined)
  })
}

setInterval(() => {
  const m = process.memoryUsage()
  console.log(
    `[hb] rss=${(m.rss / 1e6).toFixed(0)}MB heap=${(m.heapUsed / 1e6).toFixed(0)}/${(m.heapTotal / 1e6).toFixed(0)}MB`,
  )
}, 30_000).unref()

async function handleWorkflowJob(job: WorkflowJob): Promise<void> {
  switch (job.kind) {
    case 'uptime-check':
      await runUptimeCheckForSite(job.websiteId)
      return
    case 'sitemap-poll':
      await runSitemapPollForSite(job.websiteId)
      return
    case 'website-purge':
      await runWebsitePurge(job.websiteId)
      return
  }
}

async function consumeQueue<T>(
  name: string,
  dequeue: (blockSec: number) => Promise<T | null>,
  handler: (job: T) => Promise<unknown>,
) {
  let consecutiveErrors = 0
  while (running) {
    try {
      const job = await dequeue(5)
      if (!job) {
        consecutiveErrors = 0
        continue
      }
      await handler(job)
      consecutiveErrors = 0
    } catch (error) {
      consecutiveErrors++
      console.error(`[${name}] job failed:`, error)
      if (consecutiveErrors > 1) {
        const delay = Math.min(30_000, 500 * 2 ** Math.min(consecutiveErrors, 6))
        await new Promise((r) => setTimeout(r, delay))
      }
    }
  }
}

/**
 * Batch consumer: block for the first job (BRPOP), then drain whatever else
 * is already queued in one round-trip (RPOP COUNT) and process the lot in
 * parallel. Overlapping geo + DB roundtrips is a 5-10x throughput win.
 *
 * Wraps every batch in a hard timeout so a wedged DB connection or never-
 * resolving await can't permanently stall a shard. Without this we'd see
 * one shard back up to tens of thousands of events with no log line.
 */
async function consumeBatched<T>(
  name: string,
  blockDequeue: (blockSec: number) => Promise<T | null>,
  drain: (max: number) => Promise<T[]>,
  processBatch: (batch: T[]) => Promise<unknown>,
  batchSize: number,
) {
  let consecutiveErrors = 0
  let lastBatchAt = Date.now()
  // Per-loop liveness probe so we can spot a wedged consumer in logs.
  const probe = setInterval(() => {
    const idleMs = Date.now() - lastBatchAt
    if (idleMs > 60_000) console.warn(`[${name}] no batch processed in ${(idleMs / 1000).toFixed(0)}s`)
  }, 30_000)
  probe.unref()

  while (running) {
    try {
      const first = await blockDequeue(5)
      if (!first) {
        consecutiveErrors = 0
        lastBatchAt = Date.now()
        continue
      }
      const rest = batchSize > 1 ? await drain(batchSize - 1) : []
      const batch = [first, ...rest]
      // No batch-level race timeout. Postgres' statement_timeout=10s is
      // the authoritative cap on any individual query; with the batch's
      // bounded concurrency every mapper resolves (or throws) within
      // that window. Adding a shorter ceiling here was firing on
      // legitimate slow-but-progressing batches under pgbouncer
      // contention and causing the loop to skip work that would have
      // succeeded. The liveness probe ([no batch processed in Ns]) is
      // still in place to surface a truly wedged consumer.
      await processBatch(batch)
      consecutiveErrors = 0
      lastBatchAt = Date.now()
    } catch (error) {
      consecutiveErrors++
      console.error(`[${name}] batch failed:`, error)
      if (consecutiveErrors > 1) {
        const delay = Math.min(30_000, 500 * 2 ** Math.min(consecutiveErrors, 6))
        await new Promise((r) => setTimeout(r, delay))
      }
    }
  }
  clearInterval(probe)
}

async function processTrackingBatch(batch: TrackingJob[]) {
  // Bounded concurrency: don't fan out more in-flight queries than the DB
  // pool can serve. Without this, a batch=50 fan-out × 4 shards swamps
  // PgBouncer and every job waits on the connection queue → worker stalls.
  //
  // No per-event timeout here on purpose: Postgres `statement_timeout=10s`
  // (set in db.ts) is the authoritative bound on query duration. Adding a
  // shorter Promise.race timeout above it causes false-positive "timed
  // out" logs while the underlying query keeps running and eventually
  // succeeds — the worker sees a "failure" but the row lands a few
  // seconds later, confusing diagnosis. Trust the DB-level timeout.
  await mapWithConcurrency(batch, TRACKING_CONCURRENCY, async (job) => {
    const trackingCode = job.kind === 'collect' ? job.payload.trackingCode : job.payload.trackingCode
    const type = job.kind === 'collect' ? job.payload.type : 'conversion'
    try {
      const result = await processTrackingJob(job)
      if (result && typeof result === 'object') {
        if ('success' in result && result.success === false) {
          console.warn(
            `[tracking] dropped (kind=${job.kind} type=${type} code=${trackingCode}): ${(result as { error?: string }).error ?? 'unknown'}`,
          )
        } else if ('excluded' in result && result.excluded) {
          const page = job.kind === 'collect' ? job.payload.page : undefined
          console.warn(
            `[tracking] excluded (code=${trackingCode} page=${page}) — matches website excludedPaths`,
          )
        }
      }
    } catch (err) {
      // Real errors only — DB timeouts, FK violations, etc.
      console.error(
        `[tracking] job failed (kind=${job.kind} type=${type} code=${trackingCode}):`,
        err instanceof Error ? err.message : err,
      )
    }
  })
}

async function main() {
  const shardCount = getShardCount()
  console.log(
    `[worker] listening on queues ${getTrackingQueueKey()}, ${getVitalsQueueKey()}, ${getWorkflowQueueKey()}`,
  )
  console.log(
    `[worker] tracking shards=${shardCount}, batch=${TRACKING_BATCH_SIZE}, concurrency=${TRACKING_CONCURRENCY}, vitals batch=${VITALS_BATCH_SIZE}`,
  )
  startScheduler()
  startDailyStatsFlusher()

  // One consumer per shard — independent BRPOP loops so a flood on one
  // shard can't block the others. Plus a legacy consumer to drain leftover
  // jobs from the pre-shard single queue (will be a no-op once empty).
  const trackingConsumers = Array.from({ length: shardCount }, (_, shard) =>
    consumeBatched<TrackingJob>(
      `tracking#${shard}`,
      (sec) => dequeueTrackingJob(shard, sec),
      (max) => drainTrackingJobs(shard, max),
      processTrackingBatch,
      TRACKING_BATCH_SIZE,
    ),
  )

  const legacyConsumer = consumeBatched<TrackingJob>(
    'tracking#legacy',
    (sec) => dequeueTrackingJob(getLegacyQueueKey(), sec),
    (max) => drainTrackingJobs(getLegacyQueueKey(), max),
    processTrackingBatch,
    TRACKING_BATCH_SIZE,
  )

  await Promise.all([
    ...trackingConsumers,
    legacyConsumer,
    consumeBatched<VitalsJob>(
      'vitals',
      dequeueVitalsJob,
      drainVitalsJobs,
      processVitalsBatch,
      VITALS_BATCH_SIZE,
    ),
    consumeQueue('workflow', dequeueWorkflowJob, handleWorkflowJob),
  ])
}

main()
  .catch((err) => {
    console.error('[worker] fatal error:', err)
    process.exit(1)
  })
  .finally(async () => {
    try {
      await redis.quit()
    } catch {
      // already closed
    }
    console.log('[worker] stopped')
  })
