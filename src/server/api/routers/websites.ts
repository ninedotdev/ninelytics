import { nanoid } from "nanoid"
import { z } from "zod"
import { and, desc, eq, inArray, or, sql, isNotNull, lt } from "drizzle-orm"
import {
  userWebsiteAccess,
  users,
  websites,
  visitors,
  visitorSessions,
  pageViews,
  events,
  conversions,
  performanceMetrics,
  webVitals,
  searchConsoleData,
} from "@/server/db/schema"
import { protectedProcedure, publicProcedure, router } from "../trpc"
import { safeTimezone } from "@/lib/timezone"

const paginationSchema = z.object({
  page: z.number().int().min(1).optional(),
  pageSize: z.number().int().min(1).max(100).optional(),
  timezone: z.string().optional(),
})

const createWebsiteSchema = z.object({
  name: z.string().min(1, "Website name is required"),
  url: z.string().url("Please enter a valid URL"),
  description: z.string().optional(),
})

const updateWebsiteSchema = z.object({
  name: z.string().min(1, "Website name is required").optional(),
  url: z.string().url("Please enter a valid URL").optional(),
  description: z.string().optional(),
  status: z.enum(["ACTIVE", "INACTIVE", "PENDING"]).optional(),
  excludedPaths: z.array(z.string()).nullable().optional(),
  cookieConsent: z.object({
    enabled: z.boolean(),
    position: z.enum(["bottom", "top", "bottom-left", "bottom-right"]),
    theme: z.enum(["light", "dark", "auto"]),
    message: z.string(),
    acceptText: z.string(),
    rejectText: z.string(),
    categories: z.object({
      necessary: z.literal(true),
      analytics: z.boolean(),
      marketing: z.boolean(),
      preferences: z.boolean(),
    }),
    privacyPolicyUrl: z.string().optional(),
  }).nullable().optional(),
})

const ensureAccess = async (db: typeof import("@/server/db/client").db, websiteId: string, userId: string, requireWrite = false) => {
  const owner = await db
    .select({ id: websites.id })
    .from(websites)
    .where(and(eq(websites.id, websiteId), eq(websites.ownerId, userId)))
    .limit(1)

  if (owner.length > 0) return true

  const access = await db
    .select({
      level: userWebsiteAccess.accessLevel,
    })
    .from(userWebsiteAccess)
    .where(and(eq(userWebsiteAccess.websiteId, websiteId), eq(userWebsiteAccess.userId, userId)))
    .limit(1)

  if (access.length === 0) return false
  if (!requireWrite) return true

  return (
    access[0].level === "ADMIN" ||
    access[0].level === "WRITE"
  )
}

export const websitesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session!.user.id

    const accessRows = await ctx.db
      .select({ websiteId: userWebsiteAccess.websiteId })
      .from(userWebsiteAccess)
      .where(eq(userWebsiteAccess.userId, userId))

    const accessIds = accessRows.map((row) => row.websiteId)

    const websiteRows = await ctx.db
      .select({
        website: websites,
        owner: {
          id: users.id,
          name: users.name,
          email: users.email,
        },
      })
      .from(websites)
      .leftJoin(users, eq(websites.ownerId, users.id))
      .where(
        or(
          eq(websites.ownerId, userId),
          accessIds.length > 0 ? inArray(websites.id, accessIds) : eq(websites.ownerId, userId)
        )
      )
      .orderBy(desc(websites.createdAt))

    const websiteIds = websiteRows.map((row) => row.website.id)

    const accessDetails =
      websiteIds.length === 0
        ? []
        : await ctx.db
            .select({
              websiteId: userWebsiteAccess.websiteId,
              userId: userWebsiteAccess.userId,
              accessLevel: userWebsiteAccess.accessLevel,
              user: {
                id: users.id,
                name: users.name,
                email: users.email,
              },
            })
            .from(userWebsiteAccess)
            .leftJoin(users, eq(userWebsiteAccess.userId, users.id))
            .where(inArray(userWebsiteAccess.websiteId, websiteIds))

    const analyticsCounts =
      websiteIds.length === 0
        ? []
        : await ctx.db
            .select({
              websiteId: pageViews.websiteId,
              count: sql<number>`count(DISTINCT DATE(${pageViews.timestamp}))`,
            })
            .from(pageViews)
            .where(inArray(pageViews.websiteId, websiteIds))
            .groupBy(pageViews.websiteId)

    const accessByWebsite = accessDetails.reduce<Record<string, typeof accessDetails>>((acc, item) => {
      acc[item.websiteId] = acc[item.websiteId] || []
      acc[item.websiteId].push(item)
      return acc
    }, {})

    const countByWebsite = analyticsCounts.reduce<Record<string, number>>((acc, item) => {
      acc[item.websiteId] = Number(item.count)
      return acc
    }, {})

    return websiteRows.map((row) => ({
      ...row.website,
      owner: row.owner,
      userAccess: accessByWebsite[row.website.id] || [],
      _count: {
        analyticsData: countByWebsite[row.website.id] ?? 0,
      },
    }))
  }),

  create: protectedProcedure.input(createWebsiteSchema).mutation(async ({ ctx, input }) => {
    const trackingCode = `ANA_${nanoid(8).toUpperCase()}`
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://your-analytics-domain.com"
    const trackingScript = `<!-- Analytics Tracking Script -->\n<script src="${appUrl}/analytics.js" data-tracking-code="${trackingCode}" defer></script>`

    const [website] = await ctx.db
      .insert(websites)
      .values({
        name: input.name,
        url: input.url,
        description: input.description,
        trackingCode,
        ownerId: ctx.session!.user.id,
      })
      .returning({
        id: websites.id,
        name: websites.name,
        url: websites.url,
        description: websites.description,
        trackingCode: websites.trackingCode,
        ownerId: websites.ownerId,
      })

    const [owner] = await ctx.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
      })
      .from(users)
      .where(eq(users.id, ctx.session!.user.id))

    return {
      ...website,
      owner,
      trackingCode: trackingScript,
    }
  }),

  optimized: protectedProcedure
    .input(paginationSchema.optional())
    .query(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id
      const tz = safeTimezone(input?.timezone)
      const page = input?.page && input.page > 0 ? input.page : 1
      const pageSize = input?.pageSize && input.pageSize > 0 ? Math.min(input.pageSize, 100) : 50
      const offset = (page - 1) * pageSize

      // Total count of accessible websites
      const totalResult = await ctx.db.execute<{ total: number }>(sql`
        SELECT COUNT(*)::int as total
        FROM websites w
        WHERE w.status != 'PENDING'
          AND (
            w.owner_id = ${userId}
            OR EXISTS (
              SELECT 1 FROM user_website_access uwa
              WHERE uwa.website_id = w.id
                AND uwa.user_id = ${userId}
            )
          )
      `)
      const total = Number((totalResult as unknown as Array<{ total: number }>)[0]?.total ?? 0)

      const rows = await ctx.db.execute(sql`
        WITH accessible AS (
          SELECT w.*, u.name as owner_name, u.email as owner_email
          FROM websites w
          LEFT JOIN users u ON u.id = w.owner_id
          WHERE w.status != 'PENDING'
            AND (
              w.owner_id = ${userId}
              OR EXISTS (
                SELECT 1 FROM user_website_access uwa
                WHERE uwa.website_id = w.id
                  AND uwa.user_id = ${userId}
              )
            )
          ORDER BY w.created_at DESC
          LIMIT ${pageSize} OFFSET ${offset}
        )
        SELECT
          w.id, w.name, w.url, w.description, w.status, w.tracking_code,
          w.created_at, w.updated_at, w.owner_id,
          w.cloudflare_zone_id, w.cloudflare_synced_at,
          w.google_analytics_property_id, w.google_analytics_synced_at,
          w.owner_name, w.owner_email,
          (SELECT COUNT(*) FROM page_views pv WHERE pv.website_id = w.id AND pv.timestamp >= NOW() - INTERVAL '7 days') as views_last_7_days,
          (SELECT COUNT(DISTINCT pv2.visitor_id) FROM page_views pv2 WHERE pv2.website_id = w.id AND pv2.timestamp >= (NOW() AT TIME ZONE ${tz})::date AT TIME ZONE ${tz}) as visitors_today,
          (SELECT COUNT(DISTINCT pv4.visitor_id) FROM page_views pv4 WHERE pv4.website_id = w.id AND pv4.timestamp >= ((NOW() AT TIME ZONE ${tz})::date - 1) AT TIME ZONE ${tz} AND pv4.timestamp < (NOW() AT TIME ZONE ${tz})::date AT TIME ZONE ${tz}) as visitors_yesterday,
          COALESCE(EXTRACT(DAY FROM NOW() - (SELECT MIN(pv5.timestamp) FROM page_views pv5 WHERE pv5.website_id = w.id))::int, 0) as total_analytics_data,
          (SELECT json_agg(row_to_json(d)) FROM (
            SELECT to_char((pv3.timestamp AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date, 'YYYY-MM-DD') as date, COUNT(*)::int as views
            FROM page_views pv3
            WHERE pv3.website_id = w.id
              AND pv3.timestamp >= NOW() - INTERVAL '7 days'
            GROUP BY 1
            ORDER BY 1
          ) d) as last7days
        FROM accessible w
        ORDER BY w.created_at DESC
      `)

      // Build a full 7-day date array (today and 6 days back) for zero-filling
      // Use the client timezone to determine "today"
      const todayInTz = new Date(new Date().toLocaleString("en-US", { timeZone: tz }))
      const sevenDayKeys = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(todayInTz)
        d.setDate(d.getDate() - (6 - i))
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`
      })

      const rowsArray = Array.isArray(rows) ? rows : []
      const formatted = rowsArray.map((website: Record<string, unknown>) => ({
        id: website.id,
        name: website.name,
        url: website.url,
        description: website.description,
        status: website.status,
        trackingCode: website.tracking_code,
        createdAt: website.created_at,
        updatedAt: website.updated_at,
        owner: {
          id: website.owner_id,
          name: website.owner_name,
          email: website.owner_email,
        },
        cloudflareLinked: !!website.cloudflare_zone_id,
        cloudflareSyncedAt: website.cloudflare_synced_at as string | null,
        googleAnalyticsLinked: !!website.google_analytics_property_id,
        googleAnalyticsSyncedAt: website.google_analytics_synced_at as string | null,
        quickStats: {
          viewsLast7Days: Number(website.views_last_7_days ?? 0),
          visitorsToday: Number(website.visitors_today ?? 0),
          trend: (() => {
            const today = Number(website.visitors_today ?? 0)
            const yesterday = Number(website.visitors_yesterday ?? 0)
            if (today < 5) return 0
            if (yesterday === 0) return today > 0 ? 100 : 0
            return Math.round(((today - yesterday) / yesterday) * 100)
          })(),
          last7DaysData: (() => {
            const raw = Array.isArray(website.last7days)
              ? (website.last7days as Array<{ date: string; views: number }>)
              : []
            const byDay = new Map(raw.map((r) => [r.date, r.views]))
            return sevenDayKeys.map((date) => ({ date, views: byDay.get(date) ?? 0 }))
          })(),
        },
        _count: {
          analyticsData: Number(website.total_analytics_data ?? 0),
        },
      }))

      return {
        items: formatted,
        total,
        page,
        pageSize,
        hasMore: offset + pageSize < total,
      }
    }),

  byId: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id
      const { id } = input

      const accessRows = await ctx.db
        .select({ websiteId: userWebsiteAccess.websiteId })
        .from(userWebsiteAccess)
        .where(and(eq(userWebsiteAccess.websiteId, id), eq(userWebsiteAccess.userId, userId)))

      const hasAccess = accessRows.length > 0
      const websiteRow = await ctx.db
        .select({
          website: websites,
          owner: {
            id: users.id,
            name: users.name,
            email: users.email,
          },
        })
        .from(websites)
        .leftJoin(users, eq(websites.ownerId, users.id))
        .where(hasAccess ? eq(websites.id, id) : and(eq(websites.id, id), eq(websites.ownerId, userId)))
        .limit(1)

      if (websiteRow.length === 0) {
        throw new Error("Website not found")
      }

      const [record] = websiteRow

      return {
        ...record.website,
        owner: record.owner,
      }
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string(), data: updateWebsiteSchema }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id
      const { id, data } = input

      const canEdit = await ensureAccess(ctx.db, id, userId, true)
      if (!canEdit) {
        throw new Error("Website not found or insufficient permissions")
      }

      const [updated] = await ctx.db
        .update(websites)
        .set({
          ...data,
          excludedPaths: data.excludedPaths === null ? null : data.excludedPaths ?? undefined,
          updatedAt: new Date().toISOString(),
        })
        .where(eq(websites.id, id))
        .returning()

      const [owner] = await ctx.db
        .select({
          id: users.id,
          name: users.name,
          email: users.email,
        })
        .from(users)
        .where(eq(users.id, updated.ownerId))
        .limit(1)

      return {
        ...updated,
        owner,
      }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id
      const { id } = input

      const canEdit = await ensureAccess(ctx.db, id, userId, true)
      if (!canEdit) {
        throw new Error("Website not found or insufficient permissions")
      }

      // Get record counts for progress tracking
      const recordCounts = await Promise.all([
        ctx.db.select({ count: sql<number>`count(*)` }).from(pageViews).where(eq(pageViews.websiteId, id)),
        ctx.db.select({ count: sql<number>`count(*)` }).from(visitors).where(eq(visitors.websiteId, id)),
        ctx.db.select({ count: sql<number>`count(*)` }).from(visitorSessions).where(eq(visitorSessions.websiteId, id)),
        ctx.db.select({ count: sql<number>`count(*)` }).from(events).where(eq(events.websiteId, id)),
        ctx.db.select({ count: sql<number>`count(*)` }).from(conversions).where(eq(conversions.websiteId, id)),
        ctx.db.select({ count: sql<number>`count(*)` }).from(performanceMetrics).where(eq(performanceMetrics.websiteId, id)),
      ])

      const totalRecords = recordCounts.reduce((sum, result) => sum + Number(result[0]?.count ?? 0), 0)

      // Always soft-delete first (mark INACTIVE), then delete data in background
      // This prevents accidental permanent deletion and lets the user recover
      await ctx.db
        .update(websites)
        .set({ status: "INACTIVE" })
        .where(eq(websites.id, id))

      // For small datasets, also hard-delete immediately
      if (totalRecords <= 100000) {
        await ctx.db.delete(websites).where(eq(websites.id, id))
        return {
          success: true,
          message: "Website deleted successfully",
          method: "direct_delete",
          totalRecords,
        }
      }

      return {
        success: true,
        message: "Website marked for deletion",
        method: "soft_delete",
        totalRecords,
      }
    }),

  getDeletionProgress: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id
      const { id } = input

      const canAccess = await ensureAccess(ctx.db, id, userId, false)
      if (!canAccess) {
        throw new Error("Website not found")
      }

      // Check if website still exists
      const website = await ctx.db.query.websites.findFirst({
        where: eq(websites.id, id),
        columns: { id: true },
      })

      if (!website) {
        return { totalRecords: 0, deletedRecords: 0, progress: 100 }
      }

      // Count remaining records
      const remainingCounts = await Promise.all([
        ctx.db.select({ count: sql<number>`count(*)` }).from(pageViews).where(eq(pageViews.websiteId, id)),
        ctx.db.select({ count: sql<number>`count(*)` }).from(visitors).where(eq(visitors.websiteId, id)),
        ctx.db.select({ count: sql<number>`count(*)` }).from(visitorSessions).where(eq(visitorSessions.websiteId, id)),
        ctx.db.select({ count: sql<number>`count(*)` }).from(events).where(eq(events.websiteId, id)),
        ctx.db.select({ count: sql<number>`count(*)` }).from(conversions).where(eq(conversions.websiteId, id)),
        ctx.db.select({ count: sql<number>`count(*)` }).from(performanceMetrics).where(eq(performanceMetrics.websiteId, id)),
      ])

      const deletedRecords = remainingCounts.reduce((sum, result) => sum + Number(result[0]?.count ?? 0), 0)
      // Note: This is a simplified progress - in production you'd track initial count
      return {
        totalRecords: deletedRecords,
        deletedRecords: 0,
        progress: 0,
      }
    }),

  getConfig: publicProcedure
    .input(z.object({ trackingCode: z.string() }))
    .query(async ({ ctx, input }) => {
      const website = await ctx.db.query.websites.findFirst({
        where: eq(websites.trackingCode, input.trackingCode),
        columns: {
          excludedPaths: true,
        },
      })

      if (!website) {
        throw new Error("Website not found")
      }

      return {
        excludedPaths: (website.excludedPaths as string[] | null) || [],
      }
    }),


  // Integration procedures moved to separate routers:
  // - integrations/cloudflare.ts    (api.cloudflare.*)
  // - integrations/google-analytics.ts (api.googleAnalytics.*)
  // - integrations/search-console.ts   (api.searchConsole.*)
  // - integrations/stripe.ts           (api.stripe.*)

  stats: protectedProcedure
    .input(z.object({
      id: z.string(),
      timezone: z.string().optional(),
      period: z.enum(["1d", "7d", "30d", "90d"]).default("30d"),
    }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id
      const { id, period } = input
      const tz = safeTimezone(input.timezone)

      const canAccess = await ensureAccess(ctx.db, id, userId, false)
      if (!canAccess) {
        throw new Error("Website not found")
      }

      const periodDays = period === "1d" ? 1 : period === "7d" ? 7 : period === "30d" ? 30 : 90
      const periodStart = new Date()
      if (period === "1d") {
        periodStart.setUTCHours(0, 0, 0, 0)
      } else {
        periodStart.setDate(periodStart.getDate() - periodDays)
        periodStart.setUTCHours(0, 0, 0, 0)
      }
      // keep alias for compat
      const last30Days = periodStart

      // Get website info + CF credentials
      const websiteRows = await ctx.db
        .select({
          id: websites.id,
          name: websites.name,
          url: websites.url,
          status: websites.status,
          createdAt: websites.createdAt,
          cloudflareZoneId: websites.cloudflareZoneId,
          googleAnalyticsPropertyId: websites.googleAnalyticsPropertyId,
          ownerId: websites.ownerId,
        })
        .from(websites)
        .where(eq(websites.id, id))
        .limit(1)

      const website = websiteRows[0]

      if (!website) {
        throw new Error("Website not found")
      }

      // Quick count to check if there's any local data
      const hasData = (await ctx.db.select({ count: sql<number>`count(*)` }).from(pageViews).where(eq(pageViews.websiteId, id)))[0]?.count > 0

      // Chart start = same as period start (already computed above)
      const chartStart = periodStart
      const chartDays = periodDays

      // Always keep 28-day window for the prediction chart (not affected by period selector)
      const last28Start = new Date()
      last28Start.setUTCDate(last28Start.getUTCDate() - 27)
      last28Start.setUTCHours(0, 0, 0, 0)

      const emptyStats = {
        period,
        website: {
          id: website.id,
          name: website.name,
          url: website.url,
          status: website.status,
          createdAt: website.createdAt,
        },
        stats: {
          allTime: { totalVisitors: 0, totalPageViews: 0, totalSessions: 0 },
          periodStats: { visitors: 0, pageViews: 0, bounceRate: 0, avgSessionDuration: 0 },
          today: { visitors: 0, pageViews: 0 },
          topPages: [] as { page: string; views: number }[],
          topCountries: [] as { country: string; visitors: number }[],
          topCities: [] as { city: string; country: string; visitors: number }[],
          topReferrers: [] as { referrer: string; sessions: number }[],
          topSources: [] as { source: string; sessions: number }[],
          deviceBreakdown: [] as { device: string; count: number }[],
          osBreakdown: [] as { os: string; count: number }[],
          chartData: Array.from({ length: chartDays }, (_, i) => {
            const d = new Date(chartStart)
            d.setUTCDate(d.getUTCDate() + i)
            return { date: d.toISOString().slice(0, 10), views: 0 }
          }),
          last28Days: Array.from({ length: 28 }, (_, i) => {
            const d = new Date(last28Start)
            d.setUTCDate(d.getUTCDate() + i)
            return { date: d.toISOString().slice(0, 10), views: 0, visitors: 0 }
          }),
          lastActivity: null as string | null,
        },
      }

      if (!hasData) return emptyStats

      // Derive own hostname to exclude self-referrals
      let ownHostname = ''
      try {
        ownHostname = new URL(website.url).hostname.replace(/^www\./, '')
      } catch { /* ignore malformed URLs */ }

      // Fetch external breakdowns (CF + GA) in parallel with all DB queries
      type ExternalBreakdown = { name: string; count: number }[]
      type BreakdownSet = { pages: ExternalBreakdown; countries: ExternalBreakdown; devices: ExternalBreakdown; os?: ExternalBreakdown } | null

      const [cfUser] = website.cloudflareZoneId || website.googleAnalyticsPropertyId
        ? await ctx.db
            .select({ cloudflareApiToken: users.cloudflareApiToken, googleAnalyticsCredentials: users.googleAnalyticsCredentials })
            .from(users)
            .where(eq(users.id, website.ownerId))
            .limit(1)
        : [null]

      const dateStart = last30Days.toISOString().slice(0, 10)
      const dateEnd = new Date().toISOString().slice(0, 10)

      // Run ALL queries in parallel: DB stats + external breakdowns
      const [
        allTimeVisitors, allTimePageViews, allTimeSessions,
        visitorsLast30Days, pageViewsLast30Days,
        visitorsToday, pageViewsToday,
        sessionStatsData,
        topPagesData, topCountriesData, topCitiesData,
        deviceData, osData,
        topReferrersData, topSourcesData,
        chartRaw, last28Raw, last28VisitorsRaw,
        lastActivity,
        cfBreakdowns, gaBreakdowns,
      ] = await Promise.all([
        // All time stats
        ctx.db.select({ count: sql<number>`count(DISTINCT ${visitors.visitorId})` })
          .from(visitors).where(eq(visitors.websiteId, id)),
        ctx.db.select({ count: sql<number>`count(*)` })
          .from(pageViews).where(eq(pageViews.websiteId, id)),
        ctx.db.select({ count: sql<number>`count(DISTINCT ${visitorSessions.sessionId})` })
          .from(visitorSessions).where(eq(visitorSessions.websiteId, id)),
        ctx.db.select({ count: sql<number>`count(DISTINCT ${pageViews.visitorId})` })
          .from(pageViews).where(and(eq(pageViews.websiteId, id), sql`${pageViews.timestamp} >= ${last30Days.toISOString()}`)),
        ctx.db.select({ count: sql<number>`count(*)` })
          .from(pageViews).where(and(eq(pageViews.websiteId, id), sql`${pageViews.timestamp} >= ${last30Days.toISOString()}`)),
        // Today stats
        ctx.db.select({ count: sql<number>`count(DISTINCT ${pageViews.visitorId})` })
          .from(pageViews).where(and(eq(pageViews.websiteId, id), sql`(${pageViews.timestamp} AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date = (NOW() AT TIME ZONE ${tz})::date`)),
        ctx.db.select({ count: sql<number>`count(*)` })
          .from(pageViews).where(and(eq(pageViews.websiteId, id), sql`(${pageViews.timestamp} AT TIME ZONE 'UTC' AT TIME ZONE ${tz})::date = (NOW() AT TIME ZONE ${tz})::date`)),
        // Session stats
        ctx.db.select({
          totalSessions: sql<number>`count(*)`,
          bouncedSessions: sql<number>`count(*) filter (where ${visitorSessions.isBounce} = true)`,
          avgDuration: sql<number>`coalesce(avg(${visitorSessions.duration}) filter (where ${visitorSessions.duration} > 0 and ${visitorSessions.duration} < 7200), 0)`,
        }).from(visitorSessions).where(and(eq(visitorSessions.websiteId, id), sql`${visitorSessions.startTime} >= ${last30Days.toISOString()}`)),
        // Top pages
        ctx.db.select({ page: pageViews.page, count: sql<number>`count(*)` })
          .from(pageViews).where(and(eq(pageViews.websiteId, id), sql`${pageViews.timestamp} >= ${last30Days.toISOString()}`))
          .groupBy(pageViews.page).orderBy(desc(sql<number>`count(*)`)).limit(5),
        // Top countries — join pageViews so we get visitors active in the period (not just first created)
        ctx.db.select({ country: visitors.country, count: sql<number>`count(DISTINCT ${visitors.visitorId})` })
          .from(visitors)
          .innerJoin(pageViews, and(eq(pageViews.visitorId, visitors.visitorId), eq(pageViews.websiteId, id), sql`${pageViews.timestamp} >= ${last30Days.toISOString()}`))
          .where(and(eq(visitors.websiteId, id), isNotNull(visitors.country)))
          .groupBy(visitors.country).orderBy(desc(sql<number>`count(*)`)).limit(5),
        // Top cities
        ctx.db.select({ city: visitors.city, country: visitors.country, count: sql<number>`count(DISTINCT ${visitors.visitorId})` })
          .from(visitors)
          .innerJoin(pageViews, and(eq(pageViews.visitorId, visitors.visitorId), eq(pageViews.websiteId, id), sql`${pageViews.timestamp} >= ${last30Days.toISOString()}`))
          .where(and(eq(visitors.websiteId, id), isNotNull(visitors.city)))
          .groupBy(visitors.city, visitors.country).orderBy(desc(sql<number>`count(*)`)).limit(5),
        // Device breakdown
        ctx.db.select({ device: visitors.device, count: sql<number>`count(DISTINCT ${visitors.visitorId})` })
          .from(visitors)
          .innerJoin(pageViews, and(eq(pageViews.visitorId, visitors.visitorId), eq(pageViews.websiteId, id), sql`${pageViews.timestamp} >= ${last30Days.toISOString()}`))
          .where(eq(visitors.websiteId, id))
          .groupBy(visitors.device),
        // OS breakdown
        ctx.db.select({ os: visitors.os, count: sql<number>`count(DISTINCT ${visitors.visitorId})` })
          .from(visitors)
          .innerJoin(pageViews, and(eq(pageViews.visitorId, visitors.visitorId), eq(pageViews.websiteId, id), sql`${pageViews.timestamp} >= ${last30Days.toISOString()}`))
          .where(eq(visitors.websiteId, id))
          .groupBy(visitors.os),
        // Top referrers (exclude self-referrals)
        ctx.db.select({ referrer: visitorSessions.referrer, count: sql<number>`count(DISTINCT ${visitorSessions.sessionId})` })
          .from(visitorSessions).where(and(
            eq(visitorSessions.websiteId, id),
            isNotNull(visitorSessions.referrer),
            sql`${visitorSessions.referrer} != ''`,
            sql`${visitorSessions.referrer} != 'direct'`,
            ownHostname ? sql`${visitorSessions.referrer} NOT ILIKE ${'%' + ownHostname + '%'}` : sql`true`,
            sql`${visitorSessions.startTime} >= ${last30Days.toISOString()}`
          ))
          .groupBy(visitorSessions.referrer).orderBy(desc(sql<number>`count(*)`)).limit(5),
        // Top UTM sources
        ctx.db.select({ source: visitorSessions.utmSource, count: sql<number>`count(DISTINCT ${visitorSessions.sessionId})` })
          .from(visitorSessions).where(and(eq(visitorSessions.websiteId, id), isNotNull(visitorSessions.utmSource), sql`${visitorSessions.startTime} >= ${last30Days.toISOString()}`))
          .groupBy(visitorSessions.utmSource).orderBy(desc(sql<number>`count(*)`)).limit(5),
        // Chart data (period-aware, daily grouping)
        ctx.db.select({ day: sql<string>`DATE_TRUNC('day', ${pageViews.timestamp})::date::text`, views: sql<number>`count(*)` })
          .from(pageViews).where(and(eq(pageViews.websiteId, id), sql`${pageViews.timestamp} >= ${chartStart.toISOString()}`))
          .groupBy(sql`DATE_TRUNC('day', ${pageViews.timestamp})`).orderBy(sql`DATE_TRUNC('day', ${pageViews.timestamp})`),
        // Last 28 days views
        ctx.db.select({ day: sql<string>`DATE_TRUNC('day', ${pageViews.timestamp})::date::text`, views: sql<number>`count(*)` })
          .from(pageViews).where(and(eq(pageViews.websiteId, id), sql`${pageViews.timestamp} >= ${last28Start.toISOString()}`))
          .groupBy(sql`DATE_TRUNC('day', ${pageViews.timestamp})`).orderBy(sql`DATE_TRUNC('day', ${pageViews.timestamp})`),
        // Last 28 days visitors — use pageViews to count all visitors (including imported)
        ctx.db.select({ day: sql<string>`DATE_TRUNC('day', ${pageViews.timestamp})::date::text`, count: sql<number>`count(DISTINCT ${pageViews.visitorId})` })
          .from(pageViews).where(and(eq(pageViews.websiteId, id), sql`${pageViews.timestamp} >= ${last28Start.toISOString()}`))
          .groupBy(sql`DATE_TRUNC('day', ${pageViews.timestamp})`).orderBy(sql`DATE_TRUNC('day', ${pageViews.timestamp})`),
        // Last activity
        ctx.db.query.pageViews.findFirst({ where: eq(pageViews.websiteId, id), orderBy: [desc(pageViews.timestamp)], columns: { timestamp: true } }),
        // External API breakdowns removed — data is already imported into page_views/visitors
        Promise.resolve(null as BreakdownSet),
        Promise.resolve(null as BreakdownSet),
      ])

      const totalSessions = Number(sessionStatsData[0]?.totalSessions ?? 0)
      const bouncedSessions = Number(sessionStatsData[0]?.bouncedSessions ?? 0)
      const bounceRate = totalSessions > 0 ? Math.round((bouncedSessions / totalSessions) * 100) : 0
      const avgSessionDuration = Math.round(Number(sessionStatsData[0]?.avgDuration ?? 0))

      const viewsByDay = new Map(chartRaw.map((r) => [r.day, Number(r.views)]))
      const chartDaysData = Array.from({ length: chartDays }, (_, i) => {
        const d = new Date(chartStart)
        d.setUTCDate(d.getUTCDate() + i)
        return { date: d.toISOString().slice(0, 10), views: viewsByDay.get(d.toISOString().slice(0, 10)) ?? 0 }
      })

      const viewsByDay28 = new Map(last28Raw.map((r) => [r.day, Number(r.views)]))
      const visitorsByDay28 = new Map(last28VisitorsRaw.map((r) => [r.day, Number(r.count)]))
      const last28DaysData = Array.from({ length: 28 }, (_, i) => {
        const d = new Date(last28Start)
        d.setUTCDate(d.getUTCDate() + i)
        const dateKey = d.toISOString().slice(0, 10)
        return { date: dateKey, views: viewsByDay28.get(dateKey) ?? 0, visitors: visitorsByDay28.get(dateKey) ?? 0 }
      })

      // Merge helper: combine live data with external sources, summing counts by name
      const mergeBreakdown = (
        live: { name: string; count: number }[],
        ...externals: (ExternalBreakdown | undefined)[]
      ) => {
        const sources = externals.filter(Boolean) as ExternalBreakdown[]
        if (sources.length === 0) return null
        const merged = new Map<string, number>()
        for (const item of live) {
          merged.set(item.name, (merged.get(item.name) ?? 0) + item.count)
        }
        for (const source of sources) {
          for (const item of source) {
            merged.set(item.name, (merged.get(item.name) ?? 0) + item.count)
          }
        }
        return Array.from(merged.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([name, count]) => ({ name, count }))
      }

      const mergedTopPages = mergeBreakdown(
        topPagesData.map((p) => ({ name: p.page || "/", count: Number(p.count) })),
        cfBreakdowns?.pages, gaBreakdowns?.pages
      )

      const mergedTopCountries = mergeBreakdown(
        topCountriesData.map((c) => ({ name: c.country || "Unknown", count: Number(c.count) })),
        cfBreakdowns?.countries, gaBreakdowns?.countries
      )

      const mergedDevices = mergeBreakdown(
        deviceData.map((d) => ({ name: d.device || "Bots / Other", count: Number(d.count) })),
        cfBreakdowns?.devices, gaBreakdowns?.devices
      )

      const mergedOs = mergeBreakdown(
        osData.map((o) => ({ name: o.os || "Bots / Other", count: Number(o.count) })),
        cfBreakdowns?.os, gaBreakdowns?.os
      )

      return {
        period,
        website: {
          id: website.id,
          name: website.name,
          url: website.url,
          status: website.status,
          createdAt: website.createdAt,
        },
        stats: {
          allTime: {
            totalVisitors: Number(allTimeVisitors[0]?.count ?? 0),
            totalPageViews: Number(allTimePageViews[0]?.count ?? 0),
            totalSessions: Number(allTimeSessions[0]?.count ?? 0),
          },
          periodStats: {
            visitors: Number(visitorsLast30Days[0]?.count ?? 0),
            pageViews: Number(pageViewsLast30Days[0]?.count ?? 0),
            bounceRate,
            avgSessionDuration,
          },
          today: {
            visitors: Number(visitorsToday[0]?.count ?? 0),
            pageViews: Number(pageViewsToday[0]?.count ?? 0),
          },
          topPages: mergedTopPages
            ? mergedTopPages.map((p) => ({ page: p.name, views: p.count }))
            : topPagesData.map((p) => ({ page: p.page, views: Number(p.count) })),
          topCountries: mergedTopCountries
            ? mergedTopCountries.map((c) => ({ country: c.name, visitors: c.count }))
            : topCountriesData.map((c) => ({ country: c.country || "Unknown", visitors: Number(c.count) })),
          topCities: topCitiesData.map((c) => ({
            city: c.city || "Unknown",
            country: c.country || "Unknown",
            visitors: Number(c.count),
          })),
          topReferrers: topReferrersData.map((r) => ({
            referrer: r.referrer || "Unknown",
            sessions: Number(r.count),
          })),
          topSources: topSourcesData.map((s) => ({
            source: s.source || "Unknown",
            sessions: Number(s.count),
          })),
          deviceBreakdown: mergedDevices
            ? mergedDevices.map((d) => ({ device: d.name, count: d.count }))
            : deviceData.map((d) => ({ device: d.device || "Bots / Other", count: Number(d.count) })),
          osBreakdown: mergedOs
            ? mergedOs.map((o) => ({ os: o.name, count: o.count }))
            : osData.map((o) => ({ os: o.os || "Bots / Other", count: Number(o.count) })),
          chartData: chartDaysData,
          last28Days: last28DaysData,
          lastActivity: lastActivity?.timestamp || null,
        },
      }
    }),

  cleanupData: protectedProcedure
    .input(z.object({
      websiteId: z.string(),
      olderThanDays: z.number().min(0).max(365),
      tables: z.array(z.enum(["pageViews", "events", "visitors", "sessions", "webVitals", "searchConsole", "performance"])).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id
      // Verify ownership (not just access)
      const [website] = await ctx.db
        .select({ ownerId: websites.ownerId })
        .from(websites)
        .where(eq(websites.id, input.websiteId))
        .limit(1)
      if (!website || website.ownerId !== userId) {
        throw new Error("Only the website owner can delete data")
      }

      const deleteAll = input.olderThanDays === 0
      const cutoff = deleteAll ? "" : new Date(Date.now() - input.olderThanDays * 86400000).toISOString()
      const results: Record<string, number> = {}

      const deleteAndCount = async (tableName: string, websiteCol: string, timeCol: string, isDate = false) => {
        let query: string
        if (deleteAll) {
          query = `WITH deleted AS (DELETE FROM ${tableName} WHERE ${websiteCol} = '${input.websiteId}' RETURNING 1) SELECT count(*) as cnt FROM deleted`
        } else {
          const timeCondition = isDate
            ? `${timeCol}::timestamp < '${cutoff}'::timestamp`
            : `${timeCol} < '${cutoff}'`
          query = `WITH deleted AS (DELETE FROM ${tableName} WHERE ${websiteCol} = '${input.websiteId}' AND ${timeCondition} RETURNING 1) SELECT count(*) as cnt FROM deleted`
        }
        const result = await ctx.db.execute(sql.raw(query))
        return Number((result as unknown as Array<{ cnt: string }>)[0]?.cnt ?? 0)
      }

      for (const table of input.tables) {
        switch (table) {
          case "pageViews":
            results[table] = await deleteAndCount("page_views", "website_id", "timestamp")
            break
          case "events":
            results[table] = await deleteAndCount("events", "website_id", "timestamp")
            break
          case "visitors":
            results[table] = await deleteAndCount("visitors", "website_id", "created_at")
            break
          case "sessions":
            results[table] = await deleteAndCount("visitor_sessions", "website_id", "created_at")
            break
          case "webVitals":
            results[table] = await deleteAndCount("web_vitals", "website_id", "recorded_at")
            break
          case "searchConsole":
            results[table] = await deleteAndCount("search_console_data", "website_id", "record_date", true)
            break
          case "performance":
            results[table] = await deleteAndCount("performance_metrics", "website_id", "timestamp")
            break
        }
      }

      return { success: true, deleted: results }
    }),
})

