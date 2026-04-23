/**
 * Periodic scanners. setInterval-based; each tick wraps its work in
 * try/catch so a crashed scan doesn't kill the whole loop.
 *
 * Intervals:
 *   - uptime: every 5 minutes (matches the old workflow scheduler)
 *   - sitemap auto-index: every 6 hours
 *
 * Override via env: UPTIME_SCAN_INTERVAL_MS, SITEMAP_SCAN_INTERVAL_MS.
 */
import { scanEnabledUptimeSites } from '@/workflows/uptime'
import { scanAutoIndexSites } from '@/workflows/sitemap'

const UPTIME_INTERVAL = Number(
  process.env.UPTIME_SCAN_INTERVAL_MS ?? 5 * 60 * 1000,
)
const SITEMAP_INTERVAL = Number(
  process.env.SITEMAP_SCAN_INTERVAL_MS ?? 6 * 60 * 60 * 1000,
)

let timers: NodeJS.Timeout[] = []

export function startScheduler() {
  console.log(
    `[scheduler] started uptime=${UPTIME_INTERVAL}ms sitemap=${SITEMAP_INTERVAL}ms`,
  )

  // Delay the first tick so boot doesn't hammer the DB immediately.
  const uptimeFirst = setTimeout(() => {
    runUptime()
    const t = setInterval(runUptime, UPTIME_INTERVAL)
    timers.push(t)
  }, 30_000)
  timers.push(uptimeFirst)

  const sitemapFirst = setTimeout(() => {
    runSitemap()
    const t = setInterval(runSitemap, SITEMAP_INTERVAL)
    timers.push(t)
  }, 120_000)
  timers.push(sitemapFirst)
}

export function stopScheduler() {
  for (const t of timers) clearTimeout(t)
  timers = []
}

async function runUptime() {
  try {
    const r = await scanEnabledUptimeSites()
    if (r.checked > 0 || r.failed > 0) {
      console.log(`[scheduler] uptime: checked=${r.checked} failed=${r.failed}`)
    }
  } catch (err) {
    console.error('[scheduler] uptime scan crashed:', err)
  }
}

async function runSitemap() {
  try {
    const r = await scanAutoIndexSites()
    if (r.scanned > 0 || r.failed > 0) {
      console.log(`[scheduler] sitemap: scanned=${r.scanned} failed=${r.failed}`)
    }
  } catch (err) {
    console.error('[scheduler] sitemap scan crashed:', err)
  }
}
