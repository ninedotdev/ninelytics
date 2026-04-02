import "dotenv/config"
import redis from "../src/lib/redis"
import { dequeueTrackingJob, getTrackingQueueKey, processTrackingJob } from "../src/lib/tracking-queue"

let running = true

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    running = false
  })
}

async function main() {
  console.log(`[tracking-worker] listening on queue ${getTrackingQueueKey()}`)

  while (running) {
    try {
      const job = await dequeueTrackingJob(5)
      if (!job) continue
      await processTrackingJob(job)
    } catch (error) {
      console.error("[tracking-worker] job failed:", error)
    }
  }

  await redis.quit()
}

main().catch((error) => {
  console.error("[tracking-worker] fatal error:", error)
  process.exit(1)
})
