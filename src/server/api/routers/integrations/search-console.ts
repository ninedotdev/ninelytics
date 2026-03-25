import { z } from "zod"
import { eq, sql, desc, gte } from "drizzle-orm"
import { users, websites, searchConsoleData } from "@/server/db/schema"
import { protectedProcedure, router } from "../../trpc"
import { ensureAccess } from "../helpers/ensure-access"

export const searchConsoleRouter = router({
  getSummary: protectedProcedure
    .input(z.object({ websiteId: z.string(), days: z.number().default(30) }))
    .query(async ({ ctx, input }) => {
      await ensureAccess(ctx.db, input.websiteId, ctx.session!.user.id, false)

      const since = new Date(Date.now() - input.days * 86400000).toISOString().slice(0, 10)

      const [totals] = await ctx.db.execute<{
        total_clicks: string; total_impressions: string; avg_ctr: string; avg_position: string
      }>(sql`
        SELECT
          COALESCE(SUM(clicks), 0) as total_clicks,
          COALESCE(SUM(impressions), 0) as total_impressions,
          COALESCE(AVG(NULLIF(ctr, 0)), 0) as avg_ctr,
          COALESCE(AVG(NULLIF(position, 0)), 0) as avg_position
        FROM search_console_data
        WHERE website_id = ${input.websiteId}
          AND record_date >= ${since}
      `)

      const topQueries = await ctx.db.execute<{
        query: string; clicks: string; impressions: string; ctr: string; position: string
      }>(sql`
        SELECT
          query,
          SUM(clicks) as clicks,
          SUM(impressions) as impressions,
          AVG(NULLIF(ctr, 0)) as ctr,
          AVG(NULLIF(position, 0)) as position
        FROM search_console_data
        WHERE website_id = ${input.websiteId}
          AND record_date >= ${since}
        GROUP BY query
        ORDER BY SUM(clicks) DESC
        LIMIT 15
      `)

      const topPages = await ctx.db.execute<{
        page: string; clicks: string; impressions: string
      }>(sql`
        SELECT
          page,
          SUM(clicks) as clicks,
          SUM(impressions) as impressions
        FROM search_console_data
        WHERE website_id = ${input.websiteId}
          AND record_date >= ${since}
        GROUP BY page
        ORDER BY SUM(clicks) DESC
        LIMIT 10
      `)

      const stats = (totals as unknown as Array<Record<string, string>>)[0]

      return {
        totalClicks: Number(stats?.total_clicks ?? 0),
        totalImpressions: Number(stats?.total_impressions ?? 0),
        avgCtr: Number(Number(stats?.avg_ctr ?? 0).toFixed(2)),
        avgPosition: Number(Number(stats?.avg_position ?? 0).toFixed(1)),
        topQueries: (topQueries as unknown as Array<Record<string, string>>).map((q) => ({
          query: q.query,
          clicks: Number(q.clicks),
          impressions: Number(q.impressions),
          ctr: Number(Number(q.ctr).toFixed(2)),
          position: Number(Number(q.position).toFixed(1)),
        })),
        topPages: (topPages as unknown as Array<Record<string, string>>).map((p) => ({
          page: p.page,
          clicks: Number(p.clicks),
          impressions: Number(p.impressions),
        })),
      }
    }),

  listSites: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.session!.user.id
      const [user] = await ctx.db.select({
        googleAccessToken: users.googleAccessToken,
        googleRefreshToken: users.googleRefreshToken,
      }).from(users).where(eq(users.id, userId)).limit(1)

      if (!user?.googleAccessToken || !user?.googleRefreshToken) {
        return { hasOAuth: false, sites: [] as { siteUrl: string; permissionLevel: string }[] }
      }

      const { getValidAccessToken } = await import("@/lib/google-oauth")
      const token = await getValidAccessToken(userId, ctx.db)
      if (!token) return { hasOAuth: false, sites: [] as { siteUrl: string; permissionLevel: string }[] }

      const { listSearchConsoleSites } = await import("@/lib/search-console")
      const sites = await listSearchConsoleSites(token)

      return { hasOAuth: true, sites }
    }),

  linkSite: protectedProcedure
    .input(z.object({ websiteId: z.string(), siteUrl: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ensureAccess(ctx.db, input.websiteId, ctx.session!.user.id, true)
      await ctx.db.update(websites).set({
        searchConsoleSiteUrl: input.siteUrl,
        updatedAt: new Date().toISOString(),
      }).where(eq(websites.id, input.websiteId))
      return { success: true }
    }),

  unlink: protectedProcedure
    .input(z.object({ websiteId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ensureAccess(ctx.db, input.websiteId, ctx.session!.user.id, true)
      await ctx.db.update(websites).set({
        searchConsoleSiteUrl: null,
        searchConsoleSyncedAt: null,
        updatedAt: new Date().toISOString(),
      }).where(eq(websites.id, input.websiteId))
      return { success: true }
    }),

  sync: protectedProcedure
    .input(z.object({ websiteId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id
      await ensureAccess(ctx.db, input.websiteId, userId, true)

      const { getValidAccessToken } = await import("@/lib/google-oauth")
      const token = await getValidAccessToken(userId, ctx.db)
      if (!token) throw new Error("Google not connected. Connect in Settings first.")

      const [website] = await ctx.db.select({ searchConsoleSiteUrl: websites.searchConsoleSiteUrl }).from(websites).where(eq(websites.id, input.websiteId)).limit(1)
      if (!website?.searchConsoleSiteUrl) throw new Error("No Search Console site linked")

      const { fetchSearchConsoleData } = await import("@/lib/search-console")

      const endDate = new Date()
      const startDate = new Date()
      startDate.setDate(endDate.getDate() - 89)

      const scData = await fetchSearchConsoleData(
        website.searchConsoleSiteUrl, token,
        startDate.toISOString().split("T")[0], endDate.toISOString().split("T")[0]
      )

      let synced = 0
      for (const day of scData) {
        for (const row of day.rows) {
          await ctx.db
            .insert(searchConsoleData)
            .values({
              websiteId: input.websiteId,
              recordDate: day.date,
              query: row.query,
              page: row.page,
              clicks: row.clicks,
              impressions: row.impressions,
              ctr: String(row.ctr),
              position: String(row.position),
            })
            .onConflictDoUpdate({
              target: [searchConsoleData.websiteId, searchConsoleData.recordDate, searchConsoleData.query, searchConsoleData.page],
              set: { clicks: sql`excluded.clicks`, impressions: sql`excluded.impressions`, ctr: sql`excluded.ctr`, position: sql`excluded.position` },
            })
          synced++
        }
      }

      await ctx.db.update(websites).set({ searchConsoleSyncedAt: new Date().toISOString() }).where(eq(websites.id, input.websiteId))

      // Check integration goals after sync
      try {
        const { checkIntegrationGoals } = await import("@/lib/integration-goals")
        await checkIntegrationGoals(ctx.db, input.websiteId)
      } catch { /* ignore */ }

      const totalClicks = scData.reduce((s, d) => s + d.rows.reduce((s2, r) => s2 + r.clicks, 0), 0)
      const totalImpressions = scData.reduce((s, d) => s + d.rows.reduce((s2, r) => s2 + r.impressions, 0), 0)
      const querySet = new Set<string>()
      for (const d of scData) for (const r of d.rows) querySet.add(r.query)
      const dateRange = scData.length > 0 ? { from: scData[0].date, to: scData[scData.length - 1].date } : null

      return { success: true, syncedRows: synced, totalClicks, totalImpressions, uniqueQueries: querySet.size, dateRange }
    }),
})
