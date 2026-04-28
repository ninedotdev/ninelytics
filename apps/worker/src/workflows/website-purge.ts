/**
 * Hard-delete a website + every row that references it.
 *
 * We can't just `DELETE FROM websites WHERE id = X` on a large site —
 * the FK CASCADEs lock cientos de miles de rows in a single transaction
 * and block writes for minutes. Instead we drain each child table in
 * batches with a small pause between batches, then delete the parent row.
 *
 * Idempotent: if the workflow re-runs (worker restart mid-purge), the
 * second run just deletes whatever rows are left.
 */
import { db } from '@ninelytics/shared/db'
import { websites } from '@ninelytics/db/schema'
import { eq, sql } from 'drizzle-orm'

const BATCH_SIZE = 5_000
// Tiny pause between batches lets concurrent traffic / replication catch up.
const PAUSE_MS = 50

async function deleteInBatches(
  tableName: string,
  websiteId: string,
): Promise<number> {
  // Use raw SQL with a CTE so we don't have to map every Drizzle table here.
  let total = 0
  while (true) {
    const result = await db.execute<{ deleted: number }>(sql`
      WITH victim AS (
        SELECT ctid FROM ${sql.raw(`"${tableName}"`)}
        WHERE website_id = ${websiteId}
        LIMIT ${BATCH_SIZE}
      )
      DELETE FROM ${sql.raw(`"${tableName}"`)}
      WHERE ctid IN (SELECT ctid FROM victim)
      RETURNING 1 AS deleted
    `)
    const rows = (result as unknown as Array<{ deleted: number }>).length
    total += rows
    if (rows < BATCH_SIZE) break
    await new Promise((r) => setTimeout(r, PAUSE_MS))
  }
  return total
}

// Every table with `website_id FK → websites.id ON DELETE CASCADE`. We
// drain them explicitly in batches so the final `DELETE FROM websites`
// has nothing left to cascade and finishes in milliseconds.
const CHILD_TABLES = [
  'page_views',
  'events',
  'visitor_sessions',
  'visitors',
  'web_vitals',
  'performance_metrics',
  'conversions',
  'sitemap_urls',
  'uptime_checks',
  'uptime_incidents',
  'goals',
  'funnels',
  'custom_reports',
  'search_console_data',
  'stripe_data',
  'api_keys',
  'website_share_links',
  'user_website_access',
] as const

export async function runWebsitePurge(websiteId: string): Promise<void> {
  console.log(`[website-purge] starting websiteId=${websiteId}`)

  for (const tableName of CHILD_TABLES) {
    try {
      const removed = await deleteInBatches(tableName, websiteId)
      if (removed > 0) {
        console.log(`[website-purge] cleared ${removed} rows from ${tableName}`)
      }
    } catch (err) {
      console.error(`[website-purge] failed on ${tableName}:`, err)
      throw err
    }
  }

  // All known children drained — the parent delete is just one row.
  await db.delete(websites).where(eq(websites.id, websiteId))
  console.log(`[website-purge] complete websiteId=${websiteId}`)
}
