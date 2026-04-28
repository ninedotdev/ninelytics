/**
 * Tracking-code → website resolution, cached in Redis so api and worker
 * see the same view. A status change (e.g. marking a site INACTIVE)
 * propagates to every process within `CACHE_TTL_SECONDS`.
 *
 * The previous in-memory Map cache lived per-process: the api could think
 * a site was inactive while the worker still had it cached as active for
 * up to a minute. Redis fixes that.
 */
import { and, eq } from "drizzle-orm"
import { db } from "./db"
import { websites } from "@ninelytics/db/schema"
import { redis, isRedisConnected } from "./redis"

export type CachedWebsite = {
  id: string
  excludedPaths: string[]
  cookielessMode: boolean
}

const KEY_PREFIX = "tw:"
const CACHE_TTL_SECONDS = 15
// Negative-cache marker so a flood of events for an unknown / inactive
// tracking code doesn't hammer Postgres with one SELECT per event.
const NEG_MARKER = "_"

function cacheKey(trackingCode: string): string {
  return `${KEY_PREFIX}${trackingCode}`
}

async function loadFromDb(trackingCode: string): Promise<CachedWebsite | null> {
  const rows = await db
    .select({
      id: websites.id,
      excludedPaths: websites.excludedPaths,
      cookielessMode: websites.cookielessMode,
    })
    .from(websites)
    .where(and(eq(websites.trackingCode, trackingCode), eq(websites.status, "ACTIVE")))
    .limit(1)

  if (rows.length === 0) return null
  return {
    id: rows[0].id,
    excludedPaths: (rows[0].excludedPaths as string[] | null) ?? [],
    cookielessMode: rows[0].cookielessMode ?? false,
  }
}

export async function getActiveWebsiteByTrackingCode(
  trackingCode: string,
): Promise<CachedWebsite | null> {
  const key = cacheKey(trackingCode)

  if (isRedisConnected) {
    try {
      const cached = await redis.get(key)
      if (cached === NEG_MARKER) return null
      if (cached) return JSON.parse(cached) as CachedWebsite
    } catch (err) {
      // Redis transient failure: fall through to DB. Don't cache the
      // result either since we couldn't read the cache.
      console.warn("[tracking-websites] cache read failed:", err)
    }
  }

  const fresh = await loadFromDb(trackingCode)

  if (isRedisConnected) {
    try {
      await redis.set(
        key,
        fresh ? JSON.stringify(fresh) : NEG_MARKER,
        "EX",
        CACHE_TTL_SECONDS,
      )
    } catch {
      // Best-effort cache write; silent on failure.
    }
  }

  return fresh
}

/**
 * Force-evict the cache entry for a tracking code. Call after
 * status/excludedPaths/cookielessMode changes so the new value is picked
 * up immediately instead of waiting for TTL.
 */
export async function clearTrackingWebsiteCache(trackingCode?: string): Promise<void> {
  if (!isRedisConnected) return
  try {
    if (trackingCode) {
      await redis.del(cacheKey(trackingCode))
      return
    }
    // Bulk clear — SCAN to avoid blocking Redis with KEYS on large datasets.
    let cursor = "0"
    do {
      const [next, found] = await redis.scan(cursor, "MATCH", `${KEY_PREFIX}*`, "COUNT", 200)
      cursor = next
      if (found.length > 0) await redis.del(...found)
    } while (cursor !== "0")
  } catch (err) {
    console.warn("[tracking-websites] cache clear failed:", err)
  }
}
