import { z } from "zod"
import { eq, sql } from "drizzle-orm"
import { websites, visitors, pageViews, visitorSessions } from "@ninelytics/db/schema"
import { protectedProcedure, router } from "../../trpc"
import { ensureAccess } from "../helpers/ensure-access"
import { toCountryName } from "@ninelytics/shared/country-names"

export const posthogRouter = router({
  connect: protectedProcedure
    .input(z.object({
      websiteId: z.string(),
      host: z.string().url(),
      projectId: z.string().min(1),
      apiKey: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      await ensureAccess(ctx.db, input.websiteId, ctx.session!.user.id, true)
      const { validatePostHogCredentials } = await import("@ninelytics/shared/posthog-api")
      await validatePostHogCredentials(input.host, input.projectId, input.apiKey)

      // Store as JSON in the posthogConfig field
      await ctx.db.update(websites).set({
        posthogConfig: JSON.stringify({ host: input.host, projectId: input.projectId, apiKey: input.apiKey }),
        updatedAt: new Date().toISOString(),
      }).where(eq(websites.id, input.websiteId))

      return { success: true }
    }),

  disconnect: protectedProcedure
    .input(z.object({ websiteId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      await ensureAccess(ctx.db, input.websiteId, ctx.session!.user.id, true)
      await ctx.db.update(websites).set({
        posthogConfig: null,
        posthogSyncedAt: null,
        updatedAt: new Date().toISOString(),
      }).where(eq(websites.id, input.websiteId))
      return { success: true }
    }),

  sync: protectedProcedure
    .input(z.object({ websiteId: z.string(), timezone: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      await ensureAccess(ctx.db, input.websiteId, ctx.session!.user.id, true)

      const [website] = await ctx.db.select({ posthogConfig: websites.posthogConfig }).from(websites).where(eq(websites.id, input.websiteId)).limit(1)
      if (!website?.posthogConfig) throw new Error("PostHog not connected")

      const config = JSON.parse(website.posthogConfig as string) as { host: string; projectId: string; apiKey: string }
      const { fetchPostHogDailyStats, fetchPostHogBreakdowns } = await import("@ninelytics/shared/posthog-api")

      const endDate = new Date()
      const startDate = new Date()
      startDate.setDate(endDate.getDate() - 364)
      const startStr = startDate.toISOString().split("T")[0]
      const endStr = endDate.toISOString().split("T")[0]

      const [daily, breakdowns] = await Promise.all([
        fetchPostHogDailyStats(config.host, config.projectId, config.apiKey, startStr, endStr),
        fetchPostHogBreakdowns(config.host, config.projectId, config.apiKey, startStr, endStr),
      ])

      // Delete previous PostHog imports
      await ctx.db.execute(sql`DELETE FROM page_views WHERE website_id = ${input.websiteId} AND visitor_id LIKE 'import-ph-%'`)
      await ctx.db.execute(sql`DELETE FROM visitors WHERE website_id = ${input.websiteId} AND visitor_id LIKE 'import-ph-%'`)
      await ctx.db.execute(sql`DELETE FROM visitor_sessions WHERE website_id = ${input.websiteId} AND session_id LIKE 'import-ph-%'`)

      // Find days with real tracking data
      const liveDays = await ctx.db.execute<{ day: string }>(sql`
        SELECT DISTINCT timestamp::date::text as day FROM page_views
        WHERE website_id = ${input.websiteId} AND visitor_id NOT LIKE 'import-%'
      `)
      const liveDaySet = new Set((liveDays as unknown as Array<{ day: string }>).map(r => r.day))

      // Build weighted pools from breakdowns (shuffled for even distribution)
      const weightedList = (items: { name: string; count: number }[]) => {
        const total = items.reduce((s, i) => s + i.count, 0)
        if (total === 0) return [] as string[]
        const result: string[] = []
        for (const item of items) {
          const slots = Math.max(1, Math.round((item.count / total) * 100))
          for (let j = 0; j < slots; j++) result.push(item.name)
        }
        // Shuffle to avoid all same-name items being consecutive
        for (let i = result.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [result[i], result[j]] = [result[j], result[i]]
        }
        return result
      }

      const countryPool = weightedList(breakdowns.countries)
      const cityPool = weightedList(breakdowns.cities)
      const devicePool = weightedList(breakdowns.devices)
      const browserPool = weightedList(breakdowns.browsers)
      const pagePool = weightedList(breakdowns.pages)
      const osPool = weightedList(breakdowns.os)
      const referrerPool = weightedList(breakdowns.referrers)
      const pick = (pool: string[], index: number) => pool.length > 0 ? pool[index % pool.length] : null

      // Visitor pool
      const daysWithData = daily.filter(d => d.uniqueVisitors > 0)
      const sumUv = daysWithData.reduce((s, d) => s + d.uniqueVisitors, 0)
      const maxUv = Math.max(...daily.map(d => d.uniqueVisitors), 0)
      const numDays = Math.max(daysWithData.length, 1)
      const poolSize = Math.min(sumUv, Math.round(maxUv * Math.sqrt(numDays) * 1.5))

      const visitorValues = Array.from({ length: poolSize }, (_, i) => ({
        websiteId: input.websiteId,
        visitorId: `import-ph-${i}`,
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
      let visitorOffset = 0

      for (const day of daily) {
        if (day.pageViews === 0 && day.uniqueVisitors === 0) continue
        if (liveDaySet.has(day.date)) continue
        if (!earliestDate || day.date < earliestDate) earliestDate = day.date

        const uv = day.uniqueVisitors
        const pv = day.pageViews
        const ts = `${day.date}T12:00:00.000Z`

        // Pageviews
        const pvValues = Array.from({ length: pv }, (_, i) => {
          const vid = (visitorOffset + (i % uv)) % poolSize
          return {
            websiteId: input.websiteId,
            visitorId: `import-ph-${vid}`,
            sessionId: `import-ph-${day.date}-${i % uv}`,
            page: pick(pagePool, i) || "/",
            timestamp: ts,
          }
        })
        if (pvValues.length > 0) {
          for (let i = 0; i < pvValues.length; i += 500) {
            await ctx.db.insert(pageViews).values(pvValues.slice(i, i + 500))
          }
        }

        // Sessions — use PostHog data if available, estimate otherwise
        const sessionCount = day.sessions > 0 ? day.sessions : uv
        const bouncedCount = Math.round(sessionCount * (day.bounceRate || 0))
        const avgDuration = Math.round(day.avgSessionDuration || 60)

        const sessionValues = Array.from({ length: sessionCount }, (_, i) => {
          const vid = (visitorOffset + (i % uv)) % poolSize
          return {
            websiteId: input.websiteId,
            visitorId: `import-ph-${vid}`,
            sessionId: `import-ph-${day.date}-${i}`,
            startTime: ts,
            createdAt: ts,
            duration: i < bouncedCount ? Math.round(Math.random() * 10) : avgDuration + Math.round((Math.random() - 0.5) * avgDuration * 0.4),
            pageViewCount: i < bouncedCount ? 1 : Math.max(1, Math.round(pv / sessionCount)),
            isBounce: i < bouncedCount,
            source: pick(referrerPool, i) || "direct",
            referrer: pick(referrerPool, i),
          }
        })
        if (sessionValues.length > 0) {
          for (let i = 0; i < sessionValues.length; i += 500) {
            await ctx.db.insert(visitorSessions).values(sessionValues.slice(i, i + 500)).onConflictDoNothing()
          }
        }

        visitorOffset = (visitorOffset + Math.round(uv * 0.7)) % poolSize
        synced++
      }

      await ctx.db.update(websites).set({
        posthogSyncedAt: new Date().toISOString(),
        ...(earliestDate ? { createdAt: new Date(earliestDate).toISOString() } : {}),
      }).where(eq(websites.id, input.websiteId))

      const totalPageViews = daily.reduce((s, d) => s + d.pageViews, 0)
      const totalVisitors = daily.reduce((s, d) => s + d.uniqueVisitors, 0)
      const dateRange = daily.length > 0 ? { from: daily[0].date, to: daily[daily.length - 1].date } : null

      return { success: true, syncedDays: synced, totalPageViews, totalVisitors, dateRange }
    }),
})
