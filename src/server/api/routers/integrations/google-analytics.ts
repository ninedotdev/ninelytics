import { z } from "zod"
import { eq, sql } from "drizzle-orm"
import { users, websites, visitors, pageViews, visitorSessions } from "@/server/db/schema"
import { protectedProcedure, router } from "../../trpc"
import { ensureAccess } from "../helpers/ensure-access"
import { toCountryName } from "@/lib/country-names"

export const googleAnalyticsRouter = router({
  saveCredentials: protectedProcedure
    .input(z.object({ credentials: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id
      const { validateGACredentials } = await import("@/lib/google-analytics")
      const propertyCount = await validateGACredentials(input.credentials)
      await ctx.db.update(users).set({ googleAnalyticsCredentials: input.credentials }).where(eq(users.id, userId))
      return { success: true, propertyCount }
    }),

  removeCredentials: protectedProcedure
    .mutation(async ({ ctx }) => {
      const userId = ctx.session!.user.id
      await ctx.db.update(users).set({ googleAnalyticsCredentials: null }).where(eq(users.id, userId))
      const userWebsites = await ctx.db.select({ id: websites.id }).from(websites).where(eq(websites.ownerId, userId))
      for (const w of userWebsites) {
        await ctx.db.update(websites).set({ googleAnalyticsPropertyId: null, googleAnalyticsSyncedAt: null }).where(eq(websites.id, w.id))
      }
      return { success: true }
    }),

  listProperties: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.session!.user.id
      const [user] = await ctx.db.select({
        googleAnalyticsCredentials: users.googleAnalyticsCredentials,
        googleAccessToken: users.googleAccessToken,
        googleRefreshToken: users.googleRefreshToken,
      }).from(users).where(eq(users.id, userId)).limit(1)

      const { listGAProperties } = await import("@/lib/google-analytics")

      if (user?.googleAccessToken && user?.googleRefreshToken) {
        const { getValidAccessToken } = await import("@/lib/google-oauth")
        const token = await getValidAccessToken(userId, ctx.db)
        if (!token) return { hasCredentials: false, hasOAuth: false, properties: [] as { name: string; displayName: string; propertyType: string }[] }
        const properties = await listGAProperties(token, true)
        return { hasCredentials: true, hasOAuth: true, properties }
      }

      const creds = user?.googleAnalyticsCredentials
      if (!creds) return { hasCredentials: false, hasOAuth: false, properties: [] as { name: string; displayName: string; propertyType: string }[] }
      const properties = await listGAProperties(creds)
      return { hasCredentials: true, hasOAuth: false, properties }
    }),

  linkProperty: protectedProcedure
    .input(z.object({ websiteId: z.string(), propertyId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ensureAccess(ctx.db, input.websiteId, ctx.session!.user.id, true)
      await ctx.db.update(websites).set({ googleAnalyticsPropertyId: input.propertyId, updatedAt: new Date().toISOString() }).where(eq(websites.id, input.websiteId))
      return { success: true }
    }),

  unlink: protectedProcedure
    .input(z.object({ websiteId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ensureAccess(ctx.db, input.websiteId, ctx.session!.user.id, true)
      await ctx.db.update(websites).set({ googleAnalyticsPropertyId: null, googleAnalyticsSyncedAt: null, updatedAt: new Date().toISOString() }).where(eq(websites.id, input.websiteId))
      return { success: true }
    }),

  sync: protectedProcedure
    .input(z.object({ websiteId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id
      await ensureAccess(ctx.db, input.websiteId, userId, true)

      const [user] = await ctx.db.select({
        googleAnalyticsCredentials: users.googleAnalyticsCredentials,
        googleAccessToken: users.googleAccessToken,
        googleRefreshToken: users.googleRefreshToken,
      }).from(users).where(eq(users.id, userId)).limit(1)

      let token: string
      let isOAuth = false
      if (user?.googleAccessToken && user?.googleRefreshToken) {
        const { getValidAccessToken } = await import("@/lib/google-oauth")
        const oauthToken = await getValidAccessToken(userId, ctx.db)
        if (!oauthToken) throw new Error("Google not connected. Connect in Settings first.")
        token = oauthToken
        isOAuth = true
      } else if (user?.googleAnalyticsCredentials) {
        token = user.googleAnalyticsCredentials
      } else {
        throw new Error("Google not connected. Connect in Settings first.")
      }

      const [website] = await ctx.db.select({ googleAnalyticsPropertyId: websites.googleAnalyticsPropertyId }).from(websites).where(eq(websites.id, input.websiteId)).limit(1)
      const propertyId = website?.googleAnalyticsPropertyId
      if (!propertyId) throw new Error("No GA property linked")

      const { fetchGAAnalytics, fetchGABreakdowns } = await import("@/lib/google-analytics")

      const endDate = new Date()
      const startDate = new Date()
      startDate.setDate(endDate.getDate() - 364)
      const startStr = startDate.toISOString().split("T")[0]
      const endStr = endDate.toISOString().split("T")[0]

      // Fetch daily data + breakdowns in parallel
      const [gaData, breakdowns] = await Promise.all([
        fetchGAAnalytics(propertyId, token, startStr, endStr, isOAuth),
        fetchGABreakdowns(propertyId, token, startStr, endStr, isOAuth),
      ])

      // Delete previous GA imports only
      await ctx.db.execute(sql`DELETE FROM page_views WHERE website_id = ${input.websiteId} AND visitor_id LIKE 'import-ga-%'`)
      await ctx.db.execute(sql`DELETE FROM visitors WHERE website_id = ${input.websiteId} AND visitor_id LIKE 'import-ga-%'`)
      await ctx.db.execute(sql`DELETE FROM visitor_sessions WHERE website_id = ${input.websiteId} AND session_id LIKE 'import-ga-%'`)

      const liveDays = await ctx.db.execute<{ day: string }>(sql`
        SELECT DISTINCT timestamp::date::text as day FROM page_views
        WHERE website_id = ${input.websiteId} AND visitor_id NOT LIKE 'import-%'
      `)
      const liveDaySet = new Set((liveDays as unknown as Array<{ day: string }>).map(r => r.day))

      // Build weighted distribution pools from breakdowns (same pattern as CF)
      const weightedList = (items: { name: string; count: number }[]) => {
        const total = items.reduce((s, i) => s + i.count, 0)
        if (total === 0) return [] as string[]
        const result: string[] = []
        for (const item of items) {
          const slots = Math.max(1, Math.round((item.count / total) * 100))
          for (let j = 0; j < slots; j++) result.push(item.name)
        }
        for (let i = result.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [result[i], result[j]] = [result[j], result[i]]
        }
        return result
      }

      const countryPool = weightedList(breakdowns.countries)
      const cityPool = weightedList(breakdowns.cities ?? [])
      const devicePool = weightedList(breakdowns.devices)
      const browserPool = weightedList(breakdowns.browsers)
      const pagePool = weightedList(breakdowns.pages)
      const osPool = weightedList(breakdowns.os ?? [])
      const sourcePool = weightedList(breakdowns.sources ?? [])
      const pick = (pool: string[], index: number) => pool.length > 0 ? pool[index % pool.length] : null

      const gaDaysWithData = gaData.filter(d => d.uniqueVisitors > 0)
      const gaSumDailyUv = gaDaysWithData.reduce((s, d) => s + d.uniqueVisitors, 0)
      const gaMaxDailyUv = Math.max(...gaData.map(d => d.uniqueVisitors), 0)
      const gaNumDays = Math.max(gaDaysWithData.length, 1)
      const gaPoolSize = Math.min(gaSumDailyUv, Math.round(gaMaxDailyUv * Math.sqrt(gaNumDays) * 1.5))

      // Create visitor pool with breakdown attributes
      const visitorValues = Array.from({ length: gaPoolSize }, (_, i) => ({
        websiteId: input.websiteId,
        visitorId: `import-ga-${i}`,
        ipAddress: null,
        userAgent: "imported",
        country: toCountryName(pick(countryPool, i)),
        city: pick(cityPool, i),
        device: pick(devicePool, i),
        browser: pick(browserPool, i),
        os: pick(osPool, i),
      }))
      if (visitorValues.length > 0) {
        for (let i = 0; i < visitorValues.length; i += 500) {
          await ctx.db.insert(visitors).values(visitorValues.slice(i, i + 500)).onConflictDoNothing()
        }
      }

      let synced = 0
      let earliestDate: string | null = null
      let gaVisitorOffset = 0

      for (const day of gaData) {
        if (day.pageViews === 0 && day.uniqueVisitors === 0) continue
        if (liveDaySet.has(day.date)) continue
        if (!earliestDate || day.date < earliestDate) earliestDate = day.date

        const uv = day.uniqueVisitors
        const pv = day.pageViews
        const ts = `${day.date}T12:00:00.000Z`

        const pvValues = Array.from({ length: pv }, (_, i) => {
          const vid = (gaVisitorOffset + (i % uv)) % gaPoolSize
          return {
            websiteId: input.websiteId,
            visitorId: `import-ga-${vid}`,
            sessionId: `import-ga-${day.date}-${i % uv}`,
            page: pick(pagePool, i) || "/",
            timestamp: ts,
          }
        })
        gaVisitorOffset = (gaVisitorOffset + Math.round(uv * 0.7)) % gaPoolSize
        if (pvValues.length > 0) {
          for (let i = 0; i < pvValues.length; i += 500) {
            await ctx.db.insert(pageViews).values(pvValues.slice(i, i + 500))
          }
        }
        // Create synthetic sessions with bounce rate and duration from GA
        const sessionCount = day.sessions || uv
        const bouncedCount = Math.round(sessionCount * day.bounceRate)
        const avgDuration = Math.round(day.avgSessionDuration)

        const sessionValues = Array.from({ length: sessionCount }, (_, i) => {
          const vid = (gaVisitorOffset + (i % uv)) % gaPoolSize
          return {
            websiteId: input.websiteId,
            visitorId: `import-ga-${vid}`,
            sessionId: `import-ga-${day.date}-${i}`,
            startTime: ts,
            createdAt: ts,
            duration: i < bouncedCount ? Math.round(Math.random() * 10) : avgDuration + Math.round((Math.random() - 0.5) * avgDuration * 0.4),
            pageViewCount: i < bouncedCount ? 1 : Math.max(1, Math.round(pv / sessionCount)),
            isBounce: i < bouncedCount,
            source: pick(sourcePool, i) || "direct",
            referrer: pick(sourcePool, i),
          }
        })
        if (sessionValues.length > 0) {
          for (let i = 0; i < sessionValues.length; i += 500) {
            await ctx.db.insert(visitorSessions).values(sessionValues.slice(i, i + 500)).onConflictDoNothing()
          }
        }

        synced++
      }

      await ctx.db.update(websites).set({
        googleAnalyticsSyncedAt: new Date().toISOString(),
        ...(earliestDate ? { createdAt: new Date(earliestDate).toISOString() } : {}),
      }).where(eq(websites.id, input.websiteId))

      const totalPageViews = gaData.reduce((s, d) => s + d.pageViews, 0)
      const totalVisitors = gaData.reduce((s, d) => s + d.uniqueVisitors, 0)
      const dateRange = gaData.length > 0 ? { from: gaData[0].date, to: gaData[gaData.length - 1].date } : null

      return { success: true, syncedDays: synced, totalPageViews, totalVisitors, dateRange }
    }),

  // OAuth
  getAuthUrl: protectedProcedure
    .query(async ({ ctx }) => {
      const { getGoogleAuthUrl } = await import("@/lib/google-oauth")
      return { url: getGoogleAuthUrl(ctx.session!.user.id) }
    }),

  getConnectionStatus: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.session!.user.id
      const [user] = await ctx.db.select({
        googleAccessToken: users.googleAccessToken,
        googleRefreshToken: users.googleRefreshToken,
        googleScopes: users.googleScopes,
        googleAnalyticsCredentials: users.googleAnalyticsCredentials,
      }).from(users).where(eq(users.id, userId)).limit(1)

      const hasOAuth = !!(user?.googleAccessToken && user?.googleRefreshToken)
      const hasLegacy = !!user?.googleAnalyticsCredentials
      const scopes = user?.googleScopes?.split(" ") ?? []

      return {
        hasOAuth,
        hasLegacy,
        hasAnalyticsScope: scopes.some(s => s.includes("analytics")),
        hasSearchConsoleScope: scopes.some(s => s.includes("webmasters")),
      }
    }),

  disconnect: protectedProcedure
    .mutation(async ({ ctx }) => {
      const userId = ctx.session!.user.id
      const [user] = await ctx.db.select({ googleAccessToken: users.googleAccessToken }).from(users).where(eq(users.id, userId)).limit(1)
      if (user?.googleAccessToken) {
        const { revokeGoogleTokens } = await import("@/lib/google-oauth")
        await revokeGoogleTokens(user.googleAccessToken)
      }
      await ctx.db.update(users).set({
        googleAccessToken: null, googleRefreshToken: null, googleTokenExpiresAt: null, googleScopes: null, googleAnalyticsCredentials: null,
      }).where(eq(users.id, userId))
      const userWebsites = await ctx.db.select({ id: websites.id }).from(websites).where(eq(websites.ownerId, userId))
      for (const w of userWebsites) {
        await ctx.db.update(websites).set({
          googleAnalyticsPropertyId: null, googleAnalyticsSyncedAt: null,
          searchConsoleSiteUrl: null, searchConsoleSyncedAt: null,
        }).where(eq(websites.id, w.id))
      }
      return { success: true }
    }),
})
