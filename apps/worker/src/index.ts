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
  getTrackingQueueKey,
  processTrackingJob,
  type TrackingJob,
} from '@ninelytics/shared/tracking-queue'
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
import { startScheduler, stopScheduler } from '@/scheduler'

const TRACKING_BATCH_SIZE = Number(process.env.TRACKING_BATCH_SIZE ?? 50)
const VITALS_BATCH_SIZE = Number(process.env.VITALS_BATCH_SIZE ?? 200)

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
 */
async function consumeBatched<T>(
  name: string,
  blockDequeue: (blockSec: number) => Promise<T | null>,
  drain: (max: number) => Promise<T[]>,
  processBatch: (batch: T[]) => Promise<unknown>,
  batchSize: number,
) {
  let consecutiveErrors = 0
  while (running) {
    try {
      const first = await blockDequeue(5)
      if (!first) {
        consecutiveErrors = 0
        continue
      }
      const rest = batchSize > 1 ? await drain(batchSize - 1) : []
      const batch = [first, ...rest]
      await processBatch(batch)
      consecutiveErrors = 0
    } catch (error) {
      consecutiveErrors++
      console.error(`[${name}] batch failed:`, error)
      if (consecutiveErrors > 1) {
        const delay = Math.min(30_000, 500 * 2 ** Math.min(consecutiveErrors, 6))
        await new Promise((r) => setTimeout(r, delay))
      }
    }
  }
}

async function processTrackingBatch(batch: TrackingJob[]) {
  const results = await Promise.allSettled(batch.map((job) => processTrackingJob(job)))
  for (const r of results) {
    if (r.status === 'rejected') console.error('[tracking] job failed:', r.reason)
  }
}

async function main() {
  console.log(
    `[worker] listening on queues ${getTrackingQueueKey()}, ${getVitalsQueueKey()}, ${getWorkflowQueueKey()}`,
  )
  console.log(
    `[worker] batch sizes: tracking=${TRACKING_BATCH_SIZE}, vitals=${VITALS_BATCH_SIZE}`,
  )
  startScheduler()

  await Promise.all([
    consumeBatched(
      'tracking',
      dequeueTrackingJob,
      drainTrackingJobs,
      processTrackingBatch,
      TRACKING_BATCH_SIZE,
    ),
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
