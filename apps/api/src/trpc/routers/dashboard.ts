import { z } from "zod"
import { router, protectedProcedure } from "../trpc"
import {
  websites,
  userWebsiteAccess,
  visitors,
  pageViews,
  visitorSessions,
  events,
} from "@ninelytics/db/schema"
import { eq, and, sql, desc, inArray, isNotNull } from "drizzle-orm"
import { startOfDay, endOfDay, startOfMonth, endOfMonth } from "date-fns"
import { formatEventMessage } from "@ninelytics/shared/event-formatter"

async function getUserWebsiteIds(db: typeof import("@ninelytics/shared/db").db, userId: string) {
  const result = await db
    .selectDistinct({ id: websites.id })
    .from(websites)
    .leftJoin(userWebsiteAccess, eq(userWebsiteAccess.websiteId, websites.id))
    .where(
      sql`${websites.ownerId} = ${userId} OR ${userWebsiteAccess.userId} = ${userId}`
    )

  return result.map((w) => w.id)
}

export const dashboardRouter = router({
  stats: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session!.user.id
    const today = new Date()
    const startToday = startOfDay(today)
    const endToday = endOfDay(today)
    const startMonth = startOfMonth(today)
    const endMonth = endOfMonth(today)

    const websiteIds = await getUserWebsiteIds(ctx.db, userId)

    if (websiteIds.length === 0) {
      return {
        totalWebsites: 0,
        totalVisitors: 0,
        totalPageViews: 0,
        avgSessionDuration: "0m 0s",
        uniqueVisitorsToday: 0,
        pageViewsToday: 0,
        bounceRate: 0,
        visitorsYesterday: 0,
        pageViewsYesterday: 0,
      }
    }

    const yesterday = new Date(today)
    yesterday.setDate(yesterday.getDate() - 1)
    const startYesterday = startOfDay(yesterday)
    const endYesterday = endOfDay(yesterday)

    const totalWebsites = websiteIds.length

    // Run all independent queries in parallel
    const [
      totalVisitorsResult,
      totalPageViewsResult,
      uniqueVisitorsTodayResult,
      pageViewsTodayResult,
      sessionStatsResult,
      visitorsYesterdayResult,
      pageViewsYesterdayResult,
    ] = await Promise.all([
      // Total unique visitors this month
      ctx.db
        .select({ count: sql<number>`count(distinct ${visitors.visitorId})` })
        .from(visitors)
        .where(and(
          inArray(visitors.websiteId, websiteIds),
          sql`${visitors.createdAt} >= ${startMonth.toISOString()}`,
          sql`${visitors.createdAt} <= ${endMonth.toISOString()}`
        )),

      // Total page views this month
      ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(pageViews)
        .where(and(
          inArray(pageViews.websiteId, websiteIds),
          sql`${pageViews.createdAt} >= ${startMonth.toISOString()}`,
          sql`${pageViews.createdAt} <= ${endMonth.toISOString()}`
        )),

      // Visitors today
      ctx.db
        .select({ count: sql<number>`count(distinct ${visitors.visitorId})` })
        .from(visitors)
        .where(and(
          inArray(visitors.websiteId, websiteIds),
          sql`${visitors.createdAt} >= ${startToday.toISOString()}`,
          sql`${visitors.createdAt} <= ${endToday.toISOString()}`
        )),

      // Page views today
      ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(pageViews)
        .where(and(
          inArray(pageViews.websiteId, websiteIds),
          sql`${pageViews.createdAt} >= ${startToday.toISOString()}`,
          sql`${pageViews.createdAt} <= ${endToday.toISOString()}`
        )),

      // Session stats: avg duration + bounce rate in a single query
      ctx.db
        .select({
          avgDuration: sql<number>`coalesce(avg(${visitorSessions.duration}) filter (where ${visitorSessions.duration} > 0 and ${visitorSessions.duration} < 7200), 0)`,
          totalSessions: sql<number>`count(*)`,
          bouncedSessions: sql<number>`count(*) filter (where ${visitorSessions.isBounce} = true)`,
        })
        .from(visitorSessions)
        .where(and(
          inArray(visitorSessions.websiteId, websiteIds),
          sql`${visitorSessions.createdAt} >= ${startMonth.toISOString()}`,
          sql`${visitorSessions.createdAt} <= ${endMonth.toISOString()}`
        )),

      // Yesterday visitors
      ctx.db
        .select({ count: sql<number>`count(distinct ${visitors.visitorId})` })
        .from(visitors)
        .where(and(
          inArray(visitors.websiteId, websiteIds),
          sql`${visitors.createdAt} >= ${startYesterday.toISOString()}`,
          sql`${visitors.createdAt} <= ${endYesterday.toISOString()}`
        )),

      // Yesterday page views
      ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(pageViews)
        .where(and(
          inArray(pageViews.websiteId, websiteIds),
          sql`${pageViews.createdAt} >= ${startYesterday.toISOString()}`,
          sql`${pageViews.createdAt} <= ${endYesterday.toISOString()}`
        )),
    ])

    const totalVisitors = Number(totalVisitorsResult[0]?.count ?? 0)
    const totalPageViews = Number(totalPageViewsResult[0]?.count ?? 0)
    const uniqueVisitorsToday = Number(uniqueVisitorsTodayResult[0]?.count ?? 0)
    const pageViewsToday = Number(pageViewsTodayResult[0]?.count ?? 0)

    const avgDurationSec = Number(sessionStatsResult[0]?.avgDuration ?? 0)
    const minutes = Math.floor(avgDurationSec / 60)
    const seconds = Math.floor(avgDurationSec % 60)
    const avgSessionDuration = `${minutes}m ${seconds}s`

    const totalSessions = Number(sessionStatsResult[0]?.totalSessions ?? 0)
    const bouncedSessions = Number(sessionStatsResult[0]?.bouncedSessions ?? 0)
    const bounceRate = totalSessions > 0 ? (bouncedSessions / totalSessions) * 100 : 0

    return {
      totalWebsites,
      totalVisitors,
      totalPageViews,
      avgSessionDuration,
      uniqueVisitorsToday,
      pageViewsToday,
      bounceRate,
      visitorsYesterday: Number(visitorsYesterdayResult[0]?.count ?? 0),
      pageViewsYesterday: Number(pageViewsYesterdayResult[0]?.count ?? 0),
    }
  }),

  // Global dashboard data — all websites combined or filtered
  mapDashboard: protectedProcedure
    .input(z.object({ websiteId: z.string().nullish() }).optional())
    .query(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id
      const allWebsiteIds = await getUserWebsiteIds(ctx.db, userId)
      if (allWebsiteIds.length === 0) {
        return { locations: [], dailyVisitors: [], totalVisitors: 0, prevTotalVisitors: 0, topPages: [], topCountries: [], topReferrers: [], deviceBreakdown: [] }
      }

      const targetIds = input?.websiteId ? [input.websiteId] : allWebsiteIds

      const now = new Date()
      const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      const fourteenDaysAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000)

      const [
        locations,
        dailyVisitorsCurrent,
        totalVisitorsResult,
        prevTotalVisitorsResult,
        topPagesResult,
        topCountriesResult,
        topReferrersResult,
        deviceResult,
      ] = await Promise.all([
        // Map locations with per-website visitor counts
        ctx.db.execute<{ city: string; country: string; lat: string; lon: string; count: number; website_breakdown: string }>(sql`
          SELECT city, country, lat, lon,
                 SUM(cnt)::int as count,
                 STRING_AGG(website_name || ':' || cnt::text, '|' ORDER BY cnt DESC) as website_breakdown
          FROM (
            SELECT v.city, v.country, v.lat, v.lon,
                   w.name as website_name,
                   COUNT(DISTINCT v.visitor_id)::int as cnt
            FROM visitors v
            INNER JOIN websites w ON w.id = v.website_id
            WHERE v.website_id IN (${sql.join(targetIds.map(id => sql`${id}`), sql`, `)})
              AND v.lat IS NOT NULL AND v.lon IS NOT NULL
              AND v.last_visit >= ${sevenDaysAgo.toISOString()}
            GROUP BY v.city, v.country, v.lat, v.lon, w.name
          ) sub
          GROUP BY city, country, lat, lon
          ORDER BY count DESC
          LIMIT 100
        `),

        // Daily visitors current 7 days — use pageViews to include imported data
        ctx.db.execute<{ date: string; visitors: number }>(sql`
          SELECT DATE_TRUNC('day', timestamp)::date::text as date,
                 COUNT(DISTINCT visitor_id)::int as visitors
          FROM page_views
          WHERE website_id IN (${sql.join(targetIds.map(id => sql`${id}`), sql`, `)})
            AND timestamp >= ${sevenDaysAgo.toISOString()}
          GROUP BY DATE_TRUNC('day', timestamp)
          ORDER BY date
        `),

        // Unique visitors current 7 days — use pageViews to include imported data
        ctx.db.execute<{ visitors: number }>(sql`
          SELECT COUNT(DISTINCT visitor_id)::int as visitors
          FROM page_views
          WHERE website_id IN (${sql.join(targetIds.map(id => sql`${id}`), sql`, `)})
            AND timestamp >= ${sevenDaysAgo.toISOString()}
        `),

        // Unique visitors previous 7 days — use pageViews to include imported data
        ctx.db.execute<{ visitors: number }>(sql`
          SELECT COUNT(DISTINCT visitor_id)::int as visitors
          FROM page_views
          WHERE website_id IN (${sql.join(targetIds.map(id => sql`${id}`), sql`, `)})
            AND timestamp >= ${fourteenDaysAgo.toISOString()}
            AND timestamp < ${sevenDaysAgo.toISOString()}
        `),

        // Top pages
        ctx.db.execute<{ page: string; views: number }>(sql`
          SELECT page, COUNT(*)::int as views
          FROM page_views
          WHERE website_id IN (${sql.join(targetIds.map(id => sql`${id}`), sql`, `)})
            AND timestamp >= ${sevenDaysAgo.toISOString()}
          GROUP BY page ORDER BY views DESC LIMIT 6
        `),

        // Top countries
        ctx.db.execute<{ country: string; count: number }>(sql`
          SELECT country, COUNT(DISTINCT visitor_id)::int as count
          FROM visitors
          WHERE website_id IN (${sql.join(targetIds.map(id => sql`${id}`), sql`, `)})
            AND last_visit >= ${sevenDaysAgo.toISOString()}
            AND country IS NOT NULL
          GROUP BY country ORDER BY count DESC LIMIT 6
        `),

        // Top referrers
        ctx.db.execute<{ referrer: string; count: number }>(sql`
          SELECT COALESCE(referrer_domain, referrer, 'direct') as referrer,
                 COUNT(*)::int as count
          FROM visitor_sessions
          WHERE website_id IN (${sql.join(targetIds.map(id => sql`${id}`), sql`, `)})
            AND created_at >= ${sevenDaysAgo.toISOString()}
          GROUP BY COALESCE(referrer_domain, referrer, 'direct')
          ORDER BY count DESC LIMIT 6
        `),

        // Device breakdown
        ctx.db.execute<{ device: string; count: number }>(sql`
          SELECT COALESCE(device, 'Unknown') as device, COUNT(DISTINCT visitor_id)::int as count
          FROM visitors
          WHERE website_id IN (${sql.join(targetIds.map(id => sql`${id}`), sql`, `)})
            AND last_visit >= ${sevenDaysAgo.toISOString()}
          GROUP BY device ORDER BY count DESC LIMIT 5
        `),
      ])

      const totalVisitors = Number(totalVisitorsResult[0]?.visitors ?? 0)
      const prevTotalVisitors = Number(prevTotalVisitorsResult[0]?.visitors ?? 0)

      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"]

      return {
        locations: (locations as unknown as Array<{ city: string; country: string; lat: string; lon: string; count: number; website_breakdown: string }>).map((r) => ({
          city: r.city ?? "Unknown",
          country: r.country ?? "Unknown",
          lat: Number(r.lat),
          lon: Number(r.lon),
          visitors: Number(r.count),
          websites: r.website_breakdown
            ? r.website_breakdown.split("|").map((entry) => {
                const [name, count] = entry.split(":");
                return { name: name ?? "Unknown", visitors: Number(count ?? 0) };
              })
            : [],
        })),
        dailyVisitors: dailyVisitorsCurrent.map((d) => ({
          day: dayNames[new Date(d.date).getUTCDay()],
          users: Number(d.visitors),
        })),
        totalVisitors,
        prevTotalVisitors,
        topPages: topPagesResult.map((p) => ({ label: p.page, value: Number(p.views) })),
        topCountries: topCountriesResult.map((c) => ({ label: c.country, value: Number(c.count) })),
        topReferrers: topReferrersResult.map((r) => ({ label: r.referrer, value: Number(r.count) })),
        deviceBreakdown: deviceResult.map((d) => ({ device: d.device, count: Number(d.count) })),
      }
    }),

  websites: protectedProcedure.query(async ({ ctx }) => {
    const userId = ctx.session!.user.id

    const websitesData = await ctx.db.execute<{
      id: string
      name: string
      url: string
      status: string
      visitors: bigint
      page_views: bigint
      last_activity: string | null
    }>(sql`
      SELECT
        w.id,
        w.name,
        w.url,
        w.status,
        COALESCE((
          SELECT COUNT(DISTINCT pv.visitor_id)
          FROM page_views pv
          WHERE pv.website_id = w.id
        ), 0) AS visitors,
        COALESCE((
          SELECT COUNT(*)
          FROM page_views pv
          WHERE pv.website_id = w.id
        ), 0) AS page_views,
        (
          SELECT pv2.timestamp
          FROM page_views pv2
          WHERE pv2.website_id = w.id
          ORDER BY pv2.timestamp DESC
          LIMIT 1
        ) AS last_activity
      FROM websites w
      WHERE w.owner_id = ${userId}
        OR w.id IN (
          SELECT uwa.website_id
          FROM user_website_access uwa
          WHERE uwa.user_id = ${userId}
        )
      ORDER BY visitors DESC, page_views DESC
      LIMIT 10
    `)

    return (websitesData as unknown as Array<{
      id: string
      name: string
      url: string
      status: string
      visitors: bigint
      page_views: bigint
      last_activity: string | null
    }>).map((w) => ({
      id: w.id,
      name: w.name,
      url: w.url,
      status: w.status,
      visitors: Number(w.visitors),
      pageViews: Number(w.page_views),
      lastActivity: w.last_activity,
    }))
  }),

  activity: protectedProcedure
    .input(
      z.object({
        limit: z.number().default(10),
      }).optional()
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id
      const limit = input?.limit ?? 10

      const websiteIds = await getUserWebsiteIds(ctx.db, userId)

      if (websiteIds.length === 0) {
        return []
      }

      // Get recent page views
      const recentPageViews = await ctx.db
        .select({
          id: pageViews.id,
          websiteId: pageViews.websiteId,
          page: pageViews.page,
          timestamp: pageViews.timestamp,
        })
        .from(pageViews)
        .where(inArray(pageViews.websiteId, websiteIds))
        .orderBy(desc(pageViews.timestamp))
        .limit(Math.floor(limit * 0.4))

      // Get recent events
      const recentEvents = await ctx.db
        .select({
          id: events.id,
          websiteId: events.websiteId,
          name: events.eventName,
          eventType: events.eventType,
          timestamp: events.timestamp,
        })
        .from(events)
        .where(inArray(events.websiteId, websiteIds))
        .orderBy(desc(events.timestamp))
        .limit(Math.floor(limit * 0.3))

      // Get recent sessions
      const recentSessions = await ctx.db
        .select({
          id: visitorSessions.id,
          websiteId: visitorSessions.websiteId,
          startTime: visitorSessions.startTime,
        })
        .from(visitorSessions)
        .where(inArray(visitorSessions.websiteId, websiteIds))
        .orderBy(desc(visitorSessions.startTime))
        .limit(Math.floor(limit * 0.3))

      // Get website names
      const websiteNames = new Map<string, string>()
      const websitesData = await ctx.db
        .select({ id: websites.id, name: websites.name })
        .from(websites)
        .where(inArray(websites.id, websiteIds))

      websitesData.forEach((w) => {
        websiteNames.set(w.id, w.name)
      })

      // Combine and format activities
      const activities: Array<{
        id: string
        type: "pageview" | "event" | "new_visitor" | "session_start"
        message: string
        timestamp: string // ISO string with Z to ensure UTC
        websiteName?: string
      }> = []

      // Helper to convert any timestamp to ISO string (always UTC)
      const toISOString = (ts: string | Date | null | undefined): string => {
        if (!ts) return new Date().toISOString()
        const date = ts instanceof Date ? ts : new Date(ts as string | number)
        return date.toISOString() // Always returns ISO string with Z
      }

      recentPageViews.forEach((pv) => {
        activities.push({
          id: pv.id,
          type: "pageview",
          message: `Page view on ${pv.page ?? "Unknown"}`,
          timestamp: toISOString(pv.timestamp as string | Date),
          websiteName: websiteNames.get(pv.websiteId),
        })
      })

      recentEvents.forEach((ev) => {
        activities.push({
          id: ev.id,
          type: "event",
          message: formatEventMessage(
            ev.eventType ?? "custom",
            ev.name ?? "Unknown"
          ),
          timestamp: toISOString(ev.timestamp as string | Date),
          websiteName: websiteNames.get(ev.websiteId),
        })
      })

      recentSessions.forEach((session) => {
        activities.push({
          id: session.id,
          type: "session_start",
          message: "New session started",
          timestamp: toISOString(session.startTime as string | Date),
          websiteName: websiteNames.get(session.websiteId),
        })
      })

      // Sort by timestamp and limit (compare ISO strings)
      activities.sort((a, b) => {
        const timeA = new Date(a.timestamp).getTime()
        const timeB = new Date(b.timestamp).getTime()
        return timeB - timeA
      })
      return activities.slice(0, limit)
    }),

  overview: protectedProcedure
    .input(z.object({ todayDate: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
    const userId = ctx.session!.user.id
    const websiteIds = await getUserWebsiteIds(ctx.db, userId)

    const empty = { trend: [] as Array<{ date: string; views: number; visitors: number }>, topPages: [] as Array<{ page: string; websiteName: string; websiteUrl: string; views: number }>, topCountries: [] as Array<{ country: string; visitors: number }>, topSources: [] as Array<{ source: string; sessions: number }> }
    if (websiteIds.length === 0) return empty

    // Use client-supplied local date when available so the chart ends on the
    // user's "today" rather than the server's UTC date (which can lag by hours)
    const todayStr = input?.todayDate ?? new Date().toISOString().slice(0, 10)
    const [ty, tm, td] = todayStr.split('-').map(Number)
    const todayUtc = new Date(Date.UTC(ty, tm - 1, td, 23, 59, 59, 999))

    const sevenDaysAgo = new Date(Date.UTC(ty, tm - 1, td - 6, 0, 0, 0, 0))

    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setUTCDate(thirtyDaysAgo.getUTCDate() - 30)
    thirtyDaysAgo.setUTCHours(0, 0, 0, 0)

    const [trendRaw, topPagesRaw, topCountriesRaw, topSourcesRaw, websiteNames] = await Promise.all([
      // 7-day daily views + unique visitors
      ctx.db
        .select({
          day: sql<string>`DATE_TRUNC('day', ${pageViews.timestamp})::date::text`,
          views: sql<number>`count(*)`,
          visitors: sql<number>`count(distinct ${pageViews.visitorId})`,
        })
        .from(pageViews)
        .where(and(
          inArray(pageViews.websiteId, websiteIds),
          sql`${pageViews.timestamp} >= ${sevenDaysAgo.toISOString()}`,
          sql`${pageViews.timestamp} <= ${todayUtc.toISOString()}`
        ))
        .groupBy(sql`DATE_TRUNC('day', ${pageViews.timestamp})`),

      // Top pages (last 30 days, cross-website)
      ctx.db
        .select({
          page: pageViews.page,
          websiteId: pageViews.websiteId,
          views: sql<number>`count(*)`,
        })
        .from(pageViews)
        .where(and(
          inArray(pageViews.websiteId, websiteIds),
          sql`${pageViews.timestamp} >= ${thirtyDaysAgo.toISOString()}`
        ))
        .groupBy(pageViews.page, pageViews.websiteId)
        .orderBy(desc(sql`count(*)`))
        .limit(5),

      // Top countries (last 30 days)
      ctx.db
        .select({
          country: visitors.country,
          count: sql<number>`count(distinct ${visitors.visitorId})`,
        })
        .from(visitors)
        .where(and(
          inArray(visitors.websiteId, websiteIds),
          isNotNull(visitors.country),
          sql`${visitors.createdAt} >= ${thirtyDaysAgo.toISOString()}`
        ))
        .groupBy(visitors.country)
        .orderBy(desc(sql`count(distinct ${visitors.visitorId})`))
        .limit(5),

      // Top traffic sources (last 30 days)
      ctx.db
        .select({
          source: visitorSessions.source,
          count: sql<number>`count(*)`,
        })
        .from(visitorSessions)
        .where(and(
          inArray(visitorSessions.websiteId, websiteIds),
          isNotNull(visitorSessions.source),
          sql`${visitorSessions.createdAt} >= ${thirtyDaysAgo.toISOString()}`
        ))
        .groupBy(visitorSessions.source)
        .orderBy(desc(sql`count(*)`))
        .limit(5),

      // Website name/url lookup
      ctx.db
        .select({ id: websites.id, name: websites.name, url: websites.url })
        .from(websites)
        .where(inArray(websites.id, websiteIds)),
    ])

    const websiteMap = new Map(websiteNames.map((w) => [w.id, { name: w.name, url: w.url }]))

    // Zero-fill 7-day trend
    const trendByDay = new Map(trendRaw.map((r) => [r.day, { views: Number(r.views), visitors: Number(r.visitors) }]))
    const trend = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(sevenDaysAgo)
      d.setUTCDate(d.getUTCDate() + i)
      const dateKey = d.toISOString().slice(0, 10)
      return { date: dateKey, ...(trendByDay.get(dateKey) ?? { views: 0, visitors: 0 }) }
    })

    return {
      trend,
      topPages: topPagesRaw.map((p) => ({
        page: p.page ?? "/",
        websiteName: websiteMap.get(p.websiteId)?.name ?? "Unknown",
        websiteUrl: websiteMap.get(p.websiteId)?.url ?? "",
        views: Number(p.views),
      })),
      topCountries: topCountriesRaw.map((c) => ({
        country: c.country ?? "Unknown",
        visitors: Number(c.count),
      })),
      topSources: topSourcesRaw.map((s) => ({
        source: s.source ?? "direct",
        sessions: Number(s.count),
      })),
    }
  }),
})
