// Website stats caching system
import { db } from './db'
import { pageViews, visitors } from '@ninelytics/db/schema'
import { sql, count } from 'drizzle-orm'

interface CachedStats {
  viewsLast7Days: number
  visitorsToday: number
  lastUpdated: Date
}

class WebsiteStatsCache {
  private static instance: WebsiteStatsCache
  private cache: Map<string, CachedStats> = new Map()
  private readonly CACHE_TTL = 5 * 60 * 1000 // 5 minutes

  static getInstance(): WebsiteStatsCache {
    if (!WebsiteStatsCache.instance) {
      WebsiteStatsCache.instance = new WebsiteStatsCache()
    }
    return WebsiteStatsCache.instance
  }

  // Get cached stats or fetch fresh ones
  async getStats(websiteId: string): Promise<CachedStats> {
    const cached = this.cache.get(websiteId)
    
    if (cached && this.isValid(cached)) {
      return cached
    }

    // Fetch fresh stats
    const stats = await this.fetchStats(websiteId)
    this.cache.set(websiteId, stats)
    return stats
  }

  // Check if cached data is still valid
  private isValid(cached: CachedStats): boolean {
    const now = new Date()
    const age = now.getTime() - cached.lastUpdated.getTime()
    return age < this.CACHE_TTL
  }

  // Fetch fresh stats from database
  private async fetchStats(websiteId: string): Promise<CachedStats> {
    const now = new Date()
    const last7DaysStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    const [viewsLast7DaysResult, visitorsTodayResult] = await Promise.all([
      db.select({ count: count() })
        .from(pageViews)
        .where(
          sql`${pageViews.websiteId} = ${websiteId} AND ${pageViews.timestamp} >= ${last7DaysStart.toISOString()}`
        ),
      db.select({ count: count() })
        .from(visitors)
        .where(
          sql`${visitors.websiteId} = ${websiteId} AND ${visitors.createdAt} >= ${todayStart.toISOString()}`
        )
    ])

    const viewsLast7Days = Number(viewsLast7DaysResult[0]?.count ?? 0)
    const visitorsToday = Number(visitorsTodayResult[0]?.count ?? 0)

    return {
      viewsLast7Days,
      visitorsToday,
      lastUpdated: new Date()
    }
  }

  // Invalidate cache for a specific website
  invalidate(websiteId: string): void {
    this.cache.delete(websiteId)
  }

  // Invalidate all cache
  clear(): void {
    this.cache.clear()
  }

  // Get cache status
  getStatus() {
    return {
      size: this.cache.size,
      entries: Array.from(this.cache.entries()).map(([id, stats]) => ({
        websiteId: id,
        lastUpdated: stats.lastUpdated,
        isValid: this.isValid(stats)
      }))
    }
  }
}

export const websiteStatsCache = WebsiteStatsCache.getInstance()
