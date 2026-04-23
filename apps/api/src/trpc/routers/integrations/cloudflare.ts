import { z } from "zod"
import { eq, sql } from "drizzle-orm"
import { users, websites, visitors, pageViews } from "@ninelytics/db/schema"
import { protectedProcedure, router } from "../../trpc"
import { ensureAccess } from "../helpers/ensure-access"
import { toCountryName } from "@ninelytics/shared/country-names"

export const cloudflareRouter = router({
  saveToken: protectedProcedure
    .input(z.object({ apiToken: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id
      const { listCloudflareZones } = await import("@ninelytics/shared/cloudflare-analytics")
      const zones = await listCloudflareZones(input.apiToken)
      await ctx.db.update(users).set({ cloudflareApiToken: input.apiToken }).where(eq(users.id, userId))
      return { success: true, zoneCount: zones.length }
    }),

  removeToken: protectedProcedure
    .mutation(async ({ ctx }) => {
      const userId = ctx.session!.user.id
      await ctx.db.update(websites).set({ cloudflareZoneId: null, cloudflareSyncedAt: null }).where(eq(websites.ownerId, userId))
      await ctx.db.update(users).set({ cloudflareApiToken: null }).where(eq(users.id, userId))
      return { success: true }
    }),

  listZones: protectedProcedure
    .query(async ({ ctx }) => {
      const userId = ctx.session!.user.id
      const [user] = await ctx.db.select({ cloudflareApiToken: users.cloudflareApiToken }).from(users).where(eq(users.id, userId)).limit(1)
      if (!user?.cloudflareApiToken) return { hasToken: false as const, zones: [] }
      const { listCloudflareZones } = await import("@ninelytics/shared/cloudflare-analytics")
      const zones = await listCloudflareZones(user.cloudflareApiToken)
      return { hasToken: true as const, zones }
    }),

  linkZone: protectedProcedure
    .input(z.object({ websiteId: z.string(), zoneId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const canEdit = await ensureAccess(ctx.db, input.websiteId, ctx.session!.user.id, true)
      if (!canEdit) throw new Error("Website not found or insufficient permissions")
      await ctx.db.update(websites).set({ cloudflareZoneId: input.zoneId, updatedAt: new Date().toISOString() }).where(eq(websites.id, input.websiteId))
      return { success: true }
    }),

  unlink: protectedProcedure
    .input(z.object({ websiteId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const canEdit = await ensureAccess(ctx.db, input.websiteId, ctx.session!.user.id, true)
      if (!canEdit) throw new Error("Website not found or insufficient permissions")
      await ctx.db.update(websites).set({ cloudflareZoneId: null, cloudflareSyncedAt: null, updatedAt: new Date().toISOString() }).where(eq(websites.id, input.websiteId))
      return { success: true }
    }),

  sync: protectedProcedure
    .input(z.object({ websiteId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id
      const canEdit = await ensureAccess(ctx.db, input.websiteId, userId, true)
      if (!canEdit) throw new Error("Website not found or insufficient permissions")

      const [[user], [website]] = await Promise.all([
        ctx.db.select({ cloudflareApiToken: users.cloudflareApiToken }).from(users).where(eq(users.id, userId)).limit(1),
        ctx.db.select({ cloudflareZoneId: websites.cloudflareZoneId }).from(websites).where(eq(websites.id, input.websiteId)).limit(1),
      ])

      if (!user?.cloudflareApiToken) throw new Error("No Cloudflare API token configured")
      if (!website?.cloudflareZoneId) throw new Error("No Cloudflare zone linked to this website")

      const { fetchCloudflareFullSync } = await import("@ninelytics/shared/cloudflare-analytics")

      const endDate = new Date().toISOString().slice(0, 10)
      const start = new Date()
      start.setUTCDate(start.getUTCDate() - 364)
      const startDate = start.toISOString().slice(0, 10)

      const { daily: cfData, breakdowns } = await fetchCloudflareFullSync(
        website.cloudflareZoneId, user.cloudflareApiToken, startDate, endDate
      )

      // Delete previous CF imports only
      await ctx.db.execute(sql`DELETE FROM page_views WHERE website_id = ${input.websiteId} AND visitor_id LIKE 'import-cf-%'`)
      await ctx.db.execute(sql`DELETE FROM visitors WHERE website_id = ${input.websiteId} AND visitor_id LIKE 'import-cf-%'`)

      // Find days with real tracking data (skip them)
      const liveDays = await ctx.db.execute<{ day: string }>(sql`
        SELECT DISTINCT timestamp::date::text as day FROM page_views
        WHERE website_id = ${input.websiteId} AND visitor_id NOT LIKE 'import-%'
      `)
      const liveDaySet = new Set((liveDays as unknown as Array<{ day: string }>).map(r => r.day))

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
      const devicePool = weightedList(breakdowns.devices)
      const browserPool = weightedList(breakdowns.browsers)
      const pagePool = weightedList(breakdowns.pages)
      const osPool = weightedList(breakdowns.os ?? [])
      const pick = (pool: string[], index: number) => pool.length > 0 ? pool[index % pool.length] : null

      const daysWithData = cfData.filter(d => d.uniqueVisitors > 0)
      const sumDailyUv = daysWithData.reduce((s, d) => s + d.uniqueVisitors, 0)
      const maxDailyUv = Math.max(...cfData.map(d => d.uniqueVisitors), 0)
      const numDays = Math.max(daysWithData.length, 1)
      const poolSize = Math.min(sumDailyUv, Math.round(maxDailyUv * Math.sqrt(numDays) * 1.5))

      const visitorValues = Array.from({ length: poolSize }, (_, i) => ({
        websiteId: input.websiteId,
        visitorId: `import-cf-${i}`,
        ipAddress: null,
        userAgent: "imported",
        country: toCountryName(pick(countryPool, i)),
        browser: pick(browserPool, i),
        device: pick(devicePool, i),
        os: pick(osPool, i),
      }))
      if (visitorValues.length > 0) {
        for (let i = 0; i < visitorValues.length; i += 500) {
          await ctx.db.insert(visitors).values(visitorValues.slice(i, i + 500)).onConflictDoNothing()
        }
      }

      let synced = 0
      let visitorOffset = 0
      for (const day of cfData) {
        if (day.pageViews === 0 && day.uniqueVisitors === 0) continue
        if (liveDaySet.has(day.date)) continue
        const uv = day.uniqueVisitors
        const pv = day.pageViews
        const ts = `${day.date}T12:00:00.000Z`
        const pvValues = Array.from({ length: pv }, (_, i) => {
          const vid = (visitorOffset + (i % uv)) % poolSize
          return {
            websiteId: input.websiteId,
            visitorId: `import-cf-${vid}`,
            sessionId: `import-cf-${day.date}-${i % uv}`,
            page: pick(pagePool, i) || "/",
            timestamp: ts,
          }
        })
        visitorOffset = (visitorOffset + Math.round(uv * 0.7)) % poolSize
        if (pvValues.length > 0) {
          for (let i = 0; i < pvValues.length; i += 500) {
            await ctx.db.insert(pageViews).values(pvValues.slice(i, i + 500))
          }
        }
        synced++
      }

      const earliestDate = cfData.length > 0 ? cfData[0].date : null
      await ctx.db.update(websites).set({
        cloudflareSyncedAt: new Date().toISOString(),
        ...(earliestDate ? { createdAt: new Date(earliestDate).toISOString() } : {}),
      }).where(eq(websites.id, input.websiteId))

      const totalPageViews = cfData.reduce((s, d) => s + d.pageViews, 0)
      const totalVisitors = cfData.reduce((s, d) => s + d.uniqueVisitors, 0)

      return {
        success: true,
        syncedDays: synced,
        totalPageViews,
        totalVisitors,
        topCountries: breakdowns.countries.slice(0, 3).map(c => c.name),
        topDevices: breakdowns.devices.slice(0, 3).map(d => d.name),
        topBrowsers: breakdowns.browsers.slice(0, 3).map(b => b.name),
        dateRange: cfData.length > 0 ? { from: cfData[0].date, to: cfData[cfData.length - 1].date } : null,
      }
    }),
})
