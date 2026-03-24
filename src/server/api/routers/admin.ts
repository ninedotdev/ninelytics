import { router, protectedProcedure } from "../trpc"
import { QueryMonitor } from "@/lib/query-monitor"
import { eventQueue } from "@/lib/event-queue"
import { websiteStatsCache } from "@/lib/website-stats-cache"
import { users, organizations, organizationMembers, websites, pageViews } from "@/server/db/schema"
import { eq, sql, count } from "drizzle-orm"

function ensureSuperAdmin(session: { user: { isSuperAdmin: boolean } }) {
  if (!session.user.isSuperAdmin) {
    throw new Error("Unauthorized: Super admin access required")
  }
}

export const adminRouter = router({
  // Platform overview (super admin only)
  overview: protectedProcedure.query(async ({ ctx }) => {
    ensureSuperAdmin(ctx.session!)

    const [
      totalUsers,
      totalWebsites,
      totalOrgs,
      totalPageViews,
      usersByRole,
      recentUsers,
    ] = await Promise.all([
      ctx.db.select({ count: count() }).from(users),
      ctx.db.select({ count: count() }).from(websites),
      ctx.db.select({ count: count() }).from(organizations),
      ctx.db.select({ count: count() }).from(pageViews),
      ctx.db.execute<{ role: string; count: string }>(sql`
        SELECT role, count(*)::text FROM users GROUP BY role ORDER BY count DESC
      `),
      ctx.db
        .select({ id: users.id, name: users.name, email: users.email, role: users.role, isSuperAdmin: users.isSuperAdmin, createdAt: users.createdAt })
        .from(users)
        .orderBy(sql`created_at DESC`)
        .limit(10),
    ])

    return {
      totalUsers: Number(totalUsers[0]?.count ?? 0),
      totalWebsites: Number(totalWebsites[0]?.count ?? 0),
      totalOrganizations: Number(totalOrgs[0]?.count ?? 0),
      totalPageViews: Number(totalPageViews[0]?.count ?? 0),
      usersByRole: (usersByRole as unknown as Array<{ role: string; count: string }>).map(r => ({ role: r.role, count: Number(r.count) })),
      recentUsers,
    }
  }),

  allUsers: protectedProcedure
    .query(async ({ ctx }) => {
      ensureSuperAdmin(ctx.session!)

      const allUsers = await ctx.db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
          role: users.role,
          isSuperAdmin: users.isSuperAdmin,
          createdAt: users.createdAt,
        })
        .from(users)
        .orderBy(sql`created_at DESC`)

      return allUsers
    }),

  system: {
    health: protectedProcedure.query(async ({ ctx }) => {
      ensureSuperAdmin(ctx.session!)

      // Check database connection
      let dbConnection = false
      try {
        await ctx.db.execute(sql`SELECT 1`)
        dbConnection = true
      } catch {
        dbConnection = false
      }

      // Get materialized views status using Drizzle
      let materializedViewsStatus: { views: Array<{
        name: string
        last_refresh: Date | null
        row_count: number
        size_mb: string
      }> } = { views: [] }
      try {
        const result = await ctx.db.execute(sql`
          SELECT
            schemaname||'.'||matviewname as name,
            NULL as last_refresh,
            COALESCE((SELECT reltuples::bigint FROM pg_class WHERE oid = (schemaname||'.'||matviewname)::regclass), 0) as row_count,
            pg_size_pretty(pg_total_relation_size((schemaname||'.'||matviewname)::regclass)) as size_mb
          FROM pg_matviews
          WHERE schemaname = 'public'
          AND matviewname LIKE 'mv_%'
          ORDER BY matviewname
        `)
        const views = (result as unknown as Array<{
          name: string
          last_refresh: Date | null
          row_count: number
          size_mb: string
        }>) || []
        materializedViewsStatus = { views }
      } catch (error) {
        console.error("Error getting materialized view status:", error)
      }

      const [queryStats, connectionPoolStatus, poolHealth] = await Promise.all([
        QueryMonitor.getStats(),
        QueryMonitor.getConnectionPoolStatus(),
        QueryMonitor.checkConnectionPoolHealth(),
      ])

      const systemHealth = {
        timestamp: new Date().toISOString(),
        database: {
          connected: dbConnection,
          connectionPool: connectionPoolStatus,
          health: poolHealth,
        },
        materializedViews: materializedViewsStatus,
        queryPerformance: queryStats,
        recommendations: [
          ...poolHealth.recommendations,
          ...(queryStats.slowQueries > 0
            ? ["Consider refreshing materialized views"]
            : []),
          ...(materializedViewsStatus.views.some(
            (v) =>
              v.last_refresh &&
              new Date(v.last_refresh) < new Date(Date.now() - 5 * 60 * 1000)
          )
            ? ["Materialized views need refresh"]
            : []),
        ],
      }

      return systemHealth
    }),

    refreshViews: protectedProcedure.mutation(async ({ ctx }) => {
      ensureSuperAdmin(ctx.session!)

      try {
        await ctx.db.execute(sql`SELECT refresh_all_analytics_views()`)
        return { success: true, message: "All materialized views refreshed successfully" }
      } catch (error) {
        console.error("Error refreshing materialized views:", error)
        return { success: false, message: "Failed to refresh materialized views" }
      }
    }),

    clearMetrics: protectedProcedure.mutation(async ({ ctx }) => {
      ensureSuperAdmin(ctx.session!)

      QueryMonitor.clearMetrics()
      return { success: true, message: "Query metrics cleared" }
    }),
  },

  eventQueue: {
    status: protectedProcedure.query(async ({ ctx }) => {
      ensureSuperAdmin(ctx.session!)

      const status = eventQueue.getStatus()
      return {
        success: true,
        status,
      }
    }),

    clear: protectedProcedure.mutation(async ({ ctx }) => {
      ensureSuperAdmin(ctx.session!)

      eventQueue.clearQueue()
      return {
        success: true,
        message: "Event queue cleared",
      }
    }),
  },

  cache: {
    status: protectedProcedure.query(async ({ ctx }) => {
      ensureSuperAdmin(ctx.session!)

      const status = websiteStatsCache.getStatus()
      return {
        success: true,
        status,
      }
    }),

    clear: protectedProcedure.mutation(async ({ ctx }) => {
      ensureSuperAdmin(ctx.session!)

      websiteStatsCache.clear()
      return {
        success: true,
        message: "Cache cleared",
      }
    }),
  },
})

