import { z } from "zod"
import { router, protectedProcedure } from "../trpc"
import { db } from "@/server/db/client"
import {
  customReports, websites, userWebsiteAccess, users,
  pageViews, visitors, visitorSessions, searchConsoleData, stripeData,
} from "@/server/db/schema"
import { eq, and, or, desc, sql, inArray } from "drizzle-orm"

const createReportSchema = z.object({
  websiteId: z.string(),
  name: z.string().min(1).max(255),
  description: z.string().optional(),
  metrics: z.array(z.string()),
  filters: z.record(z.string(), z.string()).optional(),
  schedule: z.string().optional(),
  isPublic: z.boolean().optional(),
})

const updateReportSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
  metrics: z.array(z.string()).optional(),
  filters: z.record(z.string(), z.string()).optional(),
  schedule: z.string().optional(),
  isActive: z.boolean().optional(),
  isPublic: z.boolean().optional(),
})

async function ensureWebsiteAccess(
  dbInstance: typeof db,
  websiteId: string,
  userId: string,
  requireAdmin = false
) {
  const rows = await dbInstance
    .select({
      id: websites.id,
      name: websites.name,
      url: websites.url,
      ownerId: websites.ownerId,
      accessLevel: userWebsiteAccess.accessLevel,
    })
    .from(websites)
    .leftJoin(userWebsiteAccess, eq(userWebsiteAccess.websiteId, websites.id))
    .where(
      and(
        eq(websites.id, websiteId),
        or(
          eq(websites.ownerId, userId),
          and(
            eq(userWebsiteAccess.userId, userId),
            requireAdmin ? eq(userWebsiteAccess.accessLevel, "ADMIN") : undefined
          )
        )
      )
    )
    .limit(1)

  if (rows.length === 0) {
    throw new Error("Website not found")
  }

  return rows[0]
}

export const customReportsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        websiteId: z.string().optional(),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id
      const websiteId = input?.websiteId

      const whereConditions = []

      if (websiteId && websiteId !== "ALL") {
        // Check website access
        await ensureWebsiteAccess(ctx.db, websiteId, userId)
        whereConditions.push(eq(customReports.websiteId, websiteId))
      }

      // Get user's reports and public reports
      whereConditions.push(
        or(
          eq(customReports.userId, userId),
          eq(customReports.isPublic, true)
        )
      )

      const reports = await ctx.db.query.customReports.findMany({
        where: whereConditions.length > 0 ? and(...whereConditions) : undefined,
        orderBy: [desc(customReports.updatedAt)],
      })

      // Batch load websites and users instead of N+1
      const websiteIds = [...new Set(reports.map((r) => r.websiteId))]
      const userIds = [...new Set(reports.map((r) => r.userId))]

      const [websiteRows, userRows] = await Promise.all([
        websiteIds.length > 0
          ? ctx.db.select({ id: websites.id, name: websites.name, url: websites.url }).from(websites).where(inArray(websites.id, websiteIds))
          : [],
        userIds.length > 0
          ? ctx.db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, userIds))
          : [],
      ])

      const websiteMap = new Map(websiteRows.map((w) => [w.id, w]))
      const userMap = new Map(userRows.map((u) => [u.id, u]))

      return reports.map((report) => ({
        ...report,
        website: websiteMap.get(report.websiteId) || { id: report.websiteId, name: "Unknown", url: "" },
        user: userMap.get(report.userId) || { id: report.userId, name: null, email: "" },
      }))
    }),

  create: protectedProcedure
    .input(createReportSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id

      // Check website access (requires ADMIN level)
      await ensureWebsiteAccess(ctx.db, input.websiteId, userId, true)

      const [newReport] = await ctx.db
        .insert(customReports)
        .values({
          websiteId: input.websiteId,
          userId,
          name: input.name,
          description: input.description,
          metrics: input.metrics,
          filters: input.filters || {},
          schedule: input.schedule,
          isPublic: input.isPublic || false,
        })
        .returning()

      const website = await ctx.db.query.websites.findFirst({
        where: eq(websites.id, newReport.websiteId),
        columns: {
          id: true,
          name: true,
          url: true,
        },
      })

      return {
        ...newReport,
        website: website || { id: newReport.websiteId, name: "Unknown", url: "" },
      }
    }),

  byId: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id

      const report = await ctx.db.query.customReports.findFirst({
        where: eq(customReports.id, input.id),
      })

      if (!report) {
        throw new Error("Report not found")
      }

      // Check access: owner, admin, or public
      const hasAccess =
        report.userId === userId ||
        report.isPublic ||
        (await ensureWebsiteAccess(ctx.db, report.websiteId, userId).catch(() => null))

      if (!hasAccess) {
        throw new Error("Forbidden")
      }

      const website = await ctx.db.query.websites.findFirst({
        where: eq(websites.id, report.websiteId),
        columns: {
          id: true,
          name: true,
          url: true,
        },
      })

      const user = await ctx.db.query.users.findFirst({
        where: eq(users.id, report.userId),
        columns: {
          id: true,
          name: true,
          email: true,
        },
      })

      return {
        ...report,
        website: website || { id: report.websiteId, name: "Unknown", url: "" },
        user: user || { id: report.userId, name: null, email: "" },
      }
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        data: updateReportSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id

      // Check if report exists and user is owner
      const existingReport = await ctx.db.query.customReports.findFirst({
        where: eq(customReports.id, input.id),
      })

      if (!existingReport) {
        throw new Error("Report not found")
      }

      if (existingReport.userId !== userId) {
        throw new Error("Forbidden")
      }

      const [updated] = await ctx.db
        .update(customReports)
        .set({
          ...input.data,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(customReports.id, input.id))
        .returning()

      const website = await ctx.db.query.websites.findFirst({
        where: eq(websites.id, updated.websiteId),
        columns: {
          id: true,
          name: true,
          url: true,
        },
      })

      return {
        ...updated,
        website: website || { id: updated.websiteId, name: "Unknown", url: "" },
      }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id

      // Check if report exists and user is owner
      const existingReport = await ctx.db.query.customReports.findFirst({
        where: eq(customReports.id, input.id),
      })

      if (!existingReport) {
        throw new Error("Report not found")
      }

      if (existingReport.userId !== userId) {
        throw new Error("Forbidden")
      }

      await ctx.db.delete(customReports).where(eq(customReports.id, input.id))

      return { success: true }
    }),

  execute: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id

      const report = await ctx.db.query.customReports.findFirst({
        where: eq(customReports.id, input.id),
      })

      if (!report) {
        throw new Error("Report not found")
      }

      // Check access
      const hasAccess =
        report.userId === userId ||
        report.isPublic ||
        (await ensureWebsiteAccess(ctx.db, report.websiteId, userId).catch(() => null))

      if (!hasAccess) {
        throw new Error("Forbidden")
      }

      const website = await ctx.db.query.websites.findFirst({
        where: eq(websites.id, report.websiteId),
      })

      if (!website) {
        throw new Error("Website not found")
      }

      const metrics = (report.metrics as string[]) || []
      const end = input.endDate ? new Date(input.endDate) : new Date()
      const start = input.startDate
        ? new Date(input.startDate)
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)

      const startStr = start.toISOString()
      const endStr = end.toISOString()
      const wsId = report.websiteId

      // Build result object with only requested metrics (parallel)
      const result: Record<string, unknown> = {}
      const queries: Array<Promise<void>> = []

      // --- Traffic metrics ---
      if (metrics.includes("pageViews") || metrics.includes("uniqueVisitors")) {
        queries.push(
          ctx.db.execute<{ day: string; pv: number; uv: number }>(sql`
            SELECT DATE_TRUNC('day', ${pageViews.timestamp})::date::text as day,
                   COUNT(*)::int as pv,
                   COUNT(DISTINCT ${pageViews.visitorId})::int as uv
            FROM page_views
            WHERE website_id = ${wsId} AND timestamp >= ${startStr} AND timestamp <= ${endStr}
            GROUP BY 1 ORDER BY 1
          `).then((rows) => {
            result.dailyTraffic = rows
          })
        )
      }

      if (metrics.includes("bounceRate") || metrics.includes("avgSessionDuration")) {
        queries.push(
          ctx.db.select({
            totalSessions: sql<number>`count(*)`,
            bouncedSessions: sql<number>`count(*) filter (where ${visitorSessions.isBounce} = true)`,
            avgDuration: sql<number>`coalesce(avg(${visitorSessions.duration}) filter (where ${visitorSessions.duration} > 0 and ${visitorSessions.duration} < 7200), 0)`,
          })
          .from(visitorSessions)
          .where(and(eq(visitorSessions.websiteId, wsId), sql`${visitorSessions.createdAt} >= ${startStr}`, sql`${visitorSessions.createdAt} <= ${endStr}`))
          .then(([r]) => {
            const total = Number(r?.totalSessions ?? 0)
            result.bounceRate = total > 0 ? Number(((Number(r?.bouncedSessions ?? 0) / total) * 100).toFixed(1)) : 0
            result.avgSessionDuration = Math.round(Number(r?.avgDuration ?? 0))
          })
        )
      }

      if (metrics.includes("topPages")) {
        queries.push(
          ctx.db.select({ page: pageViews.page, count: sql<number>`count(*)` })
            .from(pageViews)
            .where(and(eq(pageViews.websiteId, wsId), sql`${pageViews.timestamp} >= ${startStr}`, sql`${pageViews.timestamp} <= ${endStr}`))
            .groupBy(pageViews.page).orderBy(desc(sql`count(*)`)).limit(10)
            .then((rows) => { result.topPages = rows.map((r) => ({ page: r.page, views: Number(r.count) })) })
        )
      }

      if (metrics.includes("deviceBreakdown")) {
        queries.push(
          ctx.db.select({ device: visitors.device, count: sql<number>`count(distinct ${visitors.visitorId})` })
            .from(visitors)
            .where(and(eq(visitors.websiteId, wsId), sql`${visitors.createdAt} >= ${startStr}`))
            .groupBy(visitors.device).orderBy(desc(sql`count(*)`)).limit(10)
            .then((rows) => { result.deviceBreakdown = rows.map((r) => ({ device: r.device || "Unknown", count: Number(r.count) })) })
        )
      }

      // --- Search Console metrics ---
      if (metrics.some((m) => m.startsWith("search") || m === "topQueries")) {
        queries.push(
          ctx.db.select({
            totalClicks: sql<number>`coalesce(sum(${searchConsoleData.clicks}), 0)`,
            totalImpressions: sql<number>`coalesce(sum(${searchConsoleData.impressions}), 0)`,
            avgPosition: sql<number>`coalesce(avg(${searchConsoleData.position}::numeric), 0)`,
          })
          .from(searchConsoleData)
          .where(and(eq(searchConsoleData.websiteId, wsId), sql`${searchConsoleData.recordDate} >= ${start.toISOString().slice(0, 10)}`))
          .then(([r]) => {
            result.searchClicks = Number(r?.totalClicks ?? 0)
            result.searchImpressions = Number(r?.totalImpressions ?? 0)
            result.searchPosition = Number(Number(r?.avgPosition ?? 0).toFixed(1))
          })
        )

        if (metrics.includes("topQueries")) {
          queries.push(
            ctx.db.select({
              query: searchConsoleData.query,
              clicks: sql<number>`sum(${searchConsoleData.clicks})`,
              impressions: sql<number>`sum(${searchConsoleData.impressions})`,
              position: sql<number>`round(avg(${searchConsoleData.position}::numeric), 1)`,
            })
            .from(searchConsoleData)
            .where(and(eq(searchConsoleData.websiteId, wsId), sql`${searchConsoleData.recordDate} >= ${start.toISOString().slice(0, 10)}`))
            .groupBy(searchConsoleData.query)
            .orderBy(desc(sql`sum(${searchConsoleData.clicks})`))
            .limit(20)
            .then((rows) => {
              result.topQueries = rows.map((r) => ({
                query: r.query,
                clicks: Number(r.clicks),
                impressions: Number(r.impressions),
                position: Number(r.position),
              }))
            })
          )
        }
      }

      // --- Revenue metrics ---
      if (metrics.some((m) => ["revenue", "charges", "newCustomers"].includes(m))) {
        queries.push(
          ctx.db.execute<{ record_date: string; revenue: number; charges: number; new_customers: number; currency: string }>(sql`
            SELECT record_date, revenue, charges, new_customers, currency
            FROM stripe_data
            WHERE website_id = ${wsId} AND record_date >= ${start.toISOString().slice(0, 10)}
            ORDER BY record_date ASC
          `).then((rows) => {
            const data = (rows as unknown as Array<{ record_date: string; revenue: number; charges: number; new_customers: number; currency: string }>)
            result.revenueDaily = data.map((r) => ({
              date: r.record_date,
              revenue: Number(r.revenue) / 100,
              charges: Number(r.charges),
              newCustomers: Number(r.new_customers),
            }))
            result.revenueTotals = {
              revenue: data.reduce((s, r) => s + Number(r.revenue), 0) / 100,
              charges: data.reduce((s, r) => s + Number(r.charges), 0),
              newCustomers: data.reduce((s, r) => s + Number(r.new_customers), 0),
              currency: data[0]?.currency ?? "usd",
            }
          })
        )
      }

      await Promise.all(queries)

      return {
        report: {
          id: report.id,
          name: report.name,
          description: report.description,
          metrics,
        },
        dateRange: {
          start: startStr,
          end: endStr,
        },
        websiteId: wsId,
        data: result,
      }
    }),
})

