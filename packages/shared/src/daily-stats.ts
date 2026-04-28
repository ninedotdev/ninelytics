/**
 * Batched daily counter flusher.
 *
 * Each pageview that lands in processEvent calls bumpDailyPageView. That
 * just updates an in-memory map of `${websiteId}|${utcDay}` → count.
 * A periodic timer (default 30s) flushes the accumulated counts as one
 * `INSERT ... ON CONFLICT DO UPDATE pageViews = pageViews + N` per
 * (website, day) — turning what would be N hot-row UPDATEs (one per
 * event, all serialized through the same row lock) into a single +N.
 *
 * Trade-off: dashboard counts read from this table can be up to one
 * flush interval (30s) stale. Anything wanting second-precision should
 * still query page_views directly for the current day.
 */
import { db } from './db'
import { websiteDailyStats } from '@ninelytics/db/schema'
import { sql } from 'drizzle-orm'

const FLUSH_INTERVAL_MS = Number(process.env.DAILY_STATS_FLUSH_MS ?? 30_000)

interface PendingCounts {
  pageViews: number
}

const pending = new Map<string, PendingCounts>()
let timerHandle: ReturnType<typeof setInterval> | null = null

function todayUtcDateKey(): string {
  return new Date().toISOString().slice(0, 10)
}

function keyFor(websiteId: string, day: string): string {
  return `${websiteId}|${day}`
}

export function bumpDailyPageView(websiteId: string): void {
  if (!websiteId) return
  const key = keyFor(websiteId, todayUtcDateKey())
  const existing = pending.get(key)
  if (existing) {
    existing.pageViews += 1
  } else {
    pending.set(key, { pageViews: 1 })
  }
}

export async function flushDailyStats(): Promise<void> {
  if (pending.size === 0) return
  // Snapshot + clear before the awaits so concurrent bumps don't get
  // wiped by a slow flush.
  const snapshot: Array<[string, PendingCounts]> = []
  for (const entry of pending.entries()) snapshot.push(entry)
  pending.clear()

  for (const [key, counts] of snapshot) {
    const sep = key.indexOf('|')
    if (sep < 0) continue
    const websiteId = key.slice(0, sep)
    const day = key.slice(sep + 1)
    if (!websiteId || !day) continue

    try {
      await db.execute(sql`
        INSERT INTO website_daily_stats (website_id, day, page_views, updated_at)
        VALUES (${websiteId}, ${day}::date, ${counts.pageViews}, NOW())
        ON CONFLICT (website_id, day) DO UPDATE
          SET page_views = website_daily_stats.page_views + ${counts.pageViews},
              updated_at = NOW()
      `)
    } catch (err) {
      // Re-queue so we don't silently lose counts. Concurrent bumps may
      // have already added fresh rows — merge instead of overwrite.
      const merged = pending.get(key)
      if (merged) merged.pageViews += counts.pageViews
      else pending.set(key, counts)
      console.error(`[daily-stats] flush failed for ${key}:`, err instanceof Error ? err.message : err)
    }
  }
}

export function startDailyStatsFlusher(): void {
  if (timerHandle) return
  timerHandle = setInterval(() => {
    flushDailyStats().catch((err) => {
      console.error('[daily-stats] timer flush threw:', err instanceof Error ? err.message : err)
    })
  }, FLUSH_INTERVAL_MS)
  // Don't keep the event loop alive just for this timer.
  if (typeof timerHandle.unref === 'function') timerHandle.unref()
}

export function stopDailyStatsFlusher(): void {
  if (timerHandle) {
    clearInterval(timerHandle)
    timerHandle = null
  }
}

void websiteDailyStats // keep import alive for SQL emission via Drizzle inference
