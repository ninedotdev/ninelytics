/**
 * Redis-backed query cache. Use for expensive read queries whose staleness
 * window is acceptable (dashboard aggregates, website lists).
 *
 *   const result = await withQueryCache(
 *     `dashboard:map:${userId}:${websiteId ?? 'all'}`,
 *     30,
 *     () => runExpensiveQuery(),
 *   )
 *
 * On Redis outage the helper falls through to the inner fn — cache is a
 * best-effort speedup, never a hard dependency.
 */
import { redis, isRedisConnected } from './redis'

export async function withQueryCache<T>(
  key: string,
  ttlSeconds: number,
  fn: () => Promise<T>,
): Promise<T> {
  if (!isRedisConnected) return fn()

  try {
    const cached = await redis.get(key)
    if (cached) return JSON.parse(cached) as T
  } catch (err) {
    console.warn('[query-cache] read failed, bypassing:', err)
    return fn()
  }

  const value = await fn()

  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttlSeconds)
  } catch (err) {
    console.warn('[query-cache] write failed:', err)
  }

  return value
}

/** Drop one or more keys — use after mutations that invalidate a cached read. */
export async function invalidateQueryCache(...keys: string[]): Promise<void> {
  if (!isRedisConnected || keys.length === 0) return
  try {
    await redis.del(...keys)
  } catch (err) {
    console.warn('[query-cache] invalidate failed:', err)
  }
}

/**
 * Drop every cache key matching a pattern. Uses SCAN so it's safe on a
 * large keyspace (no KEYS / blocking the server). Use sparingly — only on
 * mutations where an exact key list isn't known (e.g. invalidating per-
 * user caches that vary by tz/page/pageSize).
 */
export async function invalidateQueryCacheByPattern(pattern: string): Promise<void> {
  if (!isRedisConnected) return
  try {
    let cursor = '0'
    do {
      const [next, found] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 200)
      cursor = next
      if (found.length > 0) await redis.del(...found)
    } while (cursor !== '0')
  } catch (err) {
    console.warn('[query-cache] pattern invalidate failed:', err)
  }
}
