// Query Performance Monitoring
import { db } from './db'
import { sql } from 'drizzle-orm'

interface QueryMetrics {
  endpoint: string
  query: string
  duration: number
  timestamp: Date
  success: boolean
  error?: string
}

class QueryMonitor {
  private static metrics: QueryMetrics[] = []
  private static readonly MAX_METRICS = 1000 // Keep last 1000 queries
  private static readonly SLOW_QUERY_THRESHOLD = 2000 // 2 seconds

  // Log query performance
  static logQuery(
    endpoint: string,
    query: string,
    duration: number,
    success: boolean,
    error?: string
  ) {
    const metric: QueryMetrics = {
      endpoint,
      query: query.substring(0, 200), // Truncate long queries
      duration,
      timestamp: new Date(),
      success,
      error
    }

    this.metrics.push(metric)

    // Keep only recent metrics
    if (this.metrics.length > this.MAX_METRICS) {
      this.metrics = this.metrics.slice(-this.MAX_METRICS)
    }

    // Log slow queries
    if (duration > this.SLOW_QUERY_THRESHOLD) {
      console.warn(`🐌 Slow query detected:`, {
        endpoint,
        duration: `${duration}ms`,
        query: query.substring(0, 100),
        timestamp: metric.timestamp
      })
    }

    // Log failed queries
    if (!success) {
      console.error(`❌ Query failed:`, {
        endpoint,
        duration: `${duration}ms`,
        error,
        query: query.substring(0, 100),
        timestamp: metric.timestamp
      })
    }
  }

  // Get performance statistics
  static getStats(): {
    totalQueries: number
    averageDuration: number
    slowQueries: number
    failedQueries: number
    recentQueries: QueryMetrics[]
    slowestQueries: QueryMetrics[]
    mostFrequentEndpoints: Array<{ endpoint: string; count: number; avgDuration: number }>
  } {
    const now = new Date()
    const lastHour = new Date(now.getTime() - 60 * 60 * 1000)
    
    const recentQueries = this.metrics.filter(m => m.timestamp >= lastHour)
    const slowQueries = recentQueries.filter(m => m.duration > this.SLOW_QUERY_THRESHOLD)
    const failedQueries = recentQueries.filter(m => !m.success)
    
    const totalQueries = recentQueries.length
    const averageDuration = totalQueries > 0 
      ? recentQueries.reduce((sum, m) => sum + m.duration, 0) / totalQueries 
      : 0

    // Slowest queries
    const slowestQueries = [...recentQueries]
      .sort((a, b) => b.duration - a.duration)
      .slice(0, 10)

    // Most frequent endpoints
    const endpointStats = new Map<string, { count: number; totalDuration: number }>()
    recentQueries.forEach(m => {
      const existing = endpointStats.get(m.endpoint) || { count: 0, totalDuration: 0 }
      endpointStats.set(m.endpoint, {
        count: existing.count + 1,
        totalDuration: existing.totalDuration + m.duration
      })
    })

    const mostFrequentEndpoints = Array.from(endpointStats.entries())
      .map(([endpoint, stats]) => ({
        endpoint,
        count: stats.count,
        avgDuration: stats.totalDuration / stats.count
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10)

    return {
      totalQueries,
      averageDuration: Math.round(averageDuration),
      slowQueries: slowQueries.length,
      failedQueries: failedQueries.length,
      recentQueries: recentQueries.slice(-20), // Last 20 queries
      slowestQueries,
      mostFrequentEndpoints
    }
  }

  // Get database connection pool status
  static async getConnectionPoolStatus(): Promise<{
    activeConnections: number
    idleConnections: number
    totalConnections: number
    maxConnections: number
  }> {
    try {
      const result = await db.execute<{ state: string; count: bigint }>(sql`
        SELECT state, count(*) as count
        FROM pg_stat_activity 
        WHERE datname = current_database()
        GROUP BY state
      `)

      const stats = {
        activeConnections: 0,
        idleConnections: 0,
        totalConnections: 0,
        maxConnections: 100 // Default max connections
      }

      const rows = result as unknown as Array<{ state: string; count: bigint }>
      rows.forEach((row: { state: string; count: bigint }) => {
        const count = Number(row.count)
        stats.totalConnections += count
        
        if (row.state === 'active') {
          stats.activeConnections = count
        } else if (row.state === 'idle') {
          stats.idleConnections = count
        }
      })

      // Get max connections from database
      const maxConnResult = await db.execute<{ setting: string }>(sql`
        SELECT setting FROM pg_settings WHERE name = 'max_connections'
      `)
      const maxConnRows = maxConnResult as unknown as Array<{ setting: string }>
      if (maxConnRows.length > 0) {
        stats.maxConnections = parseInt(maxConnRows[0]!.setting)
      }

      return stats
    } catch (error) {
      console.error('Error getting connection pool status:', error)
      return {
        activeConnections: 0,
        idleConnections: 0,
        totalConnections: 0,
        maxConnections: 100
      }
    }
  }

  // Check for connection pool exhaustion
  static async checkConnectionPoolHealth(): Promise<{
    healthy: boolean
    warning: string | null
    recommendations: string[]
  }> {
    const poolStatus = await this.getConnectionPoolStatus()
    const recommendations: string[] = []
    let warning: string | null = null

    // Check if we're approaching max connections
    const connectionUsage = (poolStatus.totalConnections / poolStatus.maxConnections) * 100
    
    if (connectionUsage > 90) {
      warning = `High connection usage: ${connectionUsage.toFixed(1)}%`
      recommendations.push('Consider increasing max_connections in PostgreSQL')
      recommendations.push('Review connection pooling configuration')
    } else if (connectionUsage > 70) {
      warning = `Moderate connection usage: ${connectionUsage.toFixed(1)}%`
      recommendations.push('Monitor connection usage closely')
    }

    // Check for long-running queries
    const stats = this.getStats()
    if (stats.slowQueries > stats.totalQueries * 0.1) { // More than 10% slow queries
      recommendations.push('Optimize slow queries - consider adding indexes')
      recommendations.push('Review query patterns and add materialized views')
    }

    if (stats.failedQueries > stats.totalQueries * 0.05) { // More than 5% failed queries
      recommendations.push('Investigate query failures - check error logs')
    }

    return {
      healthy: connectionUsage < 90 && stats.slowQueries < stats.totalQueries * 0.2,
      warning,
      recommendations
    }
  }

  // Clear metrics (for testing)
  static clearMetrics() {
    this.metrics = []
  }
}

// Wrapper for Prisma queries with monitoring
export function withQueryMonitoring<T>(
  endpoint: string,
  queryFn: () => Promise<T>
): Promise<T> {
  const startTime = Date.now()
  const query = queryFn.toString().substring(0, 100) // Get function name/description

  return queryFn()
    .then(result => {
      const duration = Date.now() - startTime
      QueryMonitor.logQuery(endpoint, query, duration, true)
      return result
    })
    .catch(error => {
      const duration = Date.now() - startTime
      QueryMonitor.logQuery(endpoint, query, duration, false, error.message)
      throw error
    })
}

export { QueryMonitor }
