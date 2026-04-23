import { and, desc, eq, or, sql } from "drizzle-orm"
import { z } from "zod"
import { protectedProcedure, router } from "../trpc"
import {
  pageViews,
  userWebsiteAccess,
  visitorSessions,
  visitors,
  websites,
} from "@ninelytics/db/schema"

const analyticsQuerySchema = z.object({
  websiteId: z.string(),
  startDate: z.string().nullish(),
  endDate: z.string().nullish(),
  metrics: z.array(z.string()).optional(),
  device: z.string().nullish(),
  browser: z.string().nullish(),
  os: z.string().nullish(),
  country: z.string().nullish(),
  city: z.string().nullish(),
  source: z.string().nullish(),
  medium: z.string().nullish(),
  campaign: z.string().nullish(),
  referrer: z.string().nullish(),
})

const statsByIdSchema = z.object({
  websiteId: z.string(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
})

const deviceQuerySchema = z.object({
  websiteId: z.string(),
  startDate: z.string().nullish(),
  endDate: z.string().nullish(),
  browser: z.string().nullish(),
  os: z.string().nullish(),
  country: z.string().nullish(),
  city: z.string().nullish(),
  source: z.string().nullish(),
  medium: z.string().nullish(),
  campaign: z.string().nullish(),
  referrer: z.string().nullish(),
})

const pagesQuerySchema = z.object({
  websiteId: z.string(),
  startDate: z.string().nullish(),
  endDate: z.string().nullish(),
  limit: z.number().optional(),
  device: z.string().nullish(),
  browser: z.string().nullish(),
  os: z.string().nullish(),
  country: z.string().nullish(),
  city: z.string().nullish(),
  source: z.string().nullish(),
  medium: z.string().nullish(),
  campaign: z.string().nullish(),
  referrer: z.string().nullish(),
})

const trafficQuerySchema = z.object({
  websiteId: z.string(),
  startDate: z.string().nullish(),
  endDate: z.string().nullish(),
})

const ensureWebsiteAccess = async (db: typeof import("@ninelytics/shared/db").db, websiteId: string, userId: string) => {
  const rows = await db
    .select({
      id: websites.id,
      name: websites.name,
      url: websites.url,
      excludedPaths: websites.excludedPaths,
    })
    .from(websites)
    .leftJoin(userWebsiteAccess, eq(userWebsiteAccess.websiteId, websites.id))
    .where(
      and(
        eq(websites.id, websiteId),
        or(eq(websites.ownerId, userId), eq(userWebsiteAccess.userId, userId))
      )
    )
    .limit(1)

  if (rows.length === 0) {
    throw new Error("Website not found")
  }

  return rows[0]
}

// Parse YYYY-MM-DD as start or end of day in UTC
function parseUTCDate(dateStr: string, endOfDayFlag = false): Date {
  const [year, month, day] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(year, month - 1, day,
    endOfDayFlag ? 23 : 0,
    endOfDayFlag ? 59 : 0,
    endOfDayFlag ? 59 : 0,
    endOfDayFlag ? 999 : 0,
  ))
}

function utcStartOfDay(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()))
}

function utcEndOfDay(d = new Date()): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 23, 59, 59, 999))
}

export const analyticsRouter = router({
  overview: protectedProcedure
    .input(analyticsQuerySchema)
    .query(async ({ ctx, input }) => {
      const {
        websiteId,
        startDate: startDateStr,
        endDate: endDateStr,
        device,
        browser,
        os,
        country,
        city,
        source,
        medium,
        campaign,
        referrer,
      } = input

      const website = await ensureWebsiteAccess(ctx.db, websiteId, ctx.session!.user.id)
      // Normalize date range to full days in New York timezone, then convert to UTC
      // Input dates are in format YYYY-MM-DD (date strings without time)
      let startDate: Date
      let endDate: Date
      
      if (startDateStr) {
        startDate = parseUTCDate(startDateStr, false)
      } else {
        const d = new Date()
        d.setUTCDate(d.getUTCDate() - 30)
        startDate = utcStartOfDay(d)
      }

      if (endDateStr) {
        endDate = parseUTCDate(endDateStr, true)
      } else {
        endDate = utcEndOfDay()
      }

      let analyticsRows:
        | Array<{
            date: string
            pageViews: number
            uniqueVisitors: number
            bounceRate: number
            avgSessionDuration: number
          }>
        | null = null

      const excludedPaths = (website.excludedPaths as string[] | null) ?? []
      const whereParts = [
        sql`pv.website_id = ${websiteId}`,
        sql`pv.timestamp >= ${startDate.toISOString()}`,
        sql`pv.timestamp <= ${endDate.toISOString()}`,
      ]
      
      // Add excluded paths filter
      if (excludedPaths.length > 0) {
        const excludedConditions = excludedPaths.map(pattern => {
          const sqlPattern = pattern.replace(/\*/g, '%')
          return sql`pv.page NOT LIKE ${sqlPattern}`
        })
        whereParts.push(sql`${sql.join(excludedConditions, sql` AND `)}`)
      }
      
      if (device) whereParts.push(sql`v.device = ${device}`)
      if (browser) whereParts.push(sql`v.browser = ${browser}`)
      if (os) whereParts.push(sql`v.os = ${os}`)
      if (country) whereParts.push(sql`v.country = ${country}`)
      if (city) whereParts.push(sql`v.city = ${city}`)
      if (source) whereParts.push(sql`vs.source = ${source}`)
      if (medium) whereParts.push(sql`vs.medium = ${medium}`)
      if (campaign) whereParts.push(sql`vs.utm_campaign = ${campaign}`)
      if (referrer) whereParts.push(sql`vs.referrer ILIKE ${`%${referrer}%`}`)

      // Build session filter parts matching pageview filters
      const sessionWhereParts = [
        sql`vs.website_id = ${websiteId}`,
        sql`vs.created_at >= ${startDate.toISOString()}`,
        sql`vs.created_at <= ${endDate.toISOString()}`,
      ]
      if (source) sessionWhereParts.push(sql`vs.source = ${source}`)
      if (medium) sessionWhereParts.push(sql`vs.medium = ${medium}`)
      if (campaign) sessionWhereParts.push(sql`vs.utm_campaign = ${campaign}`)
      if (referrer) sessionWhereParts.push(sql`vs.referrer ILIKE ${`%${referrer}%`}`)

      // Aggregate pageviews by day in SQL instead of fetching all rows
      const [pageViewsByDay, sessionsByDay] = await Promise.all([
        ctx.db.execute<{
          day: string
          pageViews: number
          uniqueVisitors: number
        }>(sql`
          SELECT
            DATE_TRUNC('day', pv.timestamp)::date::text as day,
            COUNT(*)::int as "pageViews",
            COUNT(DISTINCT pv.visitor_id)::int as "uniqueVisitors"
          FROM page_views pv
          ${(device || browser || os || country || city) ? sql`INNER JOIN visitors v ON v.visitor_id = pv.visitor_id AND v.website_id = pv.website_id` : sql`LEFT JOIN visitors v ON v.visitor_id = pv.visitor_id AND v.website_id = pv.website_id`}
          ${(source || medium || campaign || referrer) ? sql`LEFT JOIN visitor_sessions vs ON vs.session_id = pv.session_id` : sql``}
          WHERE ${sql.join(whereParts, sql` AND `)}
          GROUP BY DATE_TRUNC('day', pv.timestamp)
          ORDER BY day ASC
        `),
        ctx.db.execute<{
          day: string
          totalSessions: number
          bouncedSessions: number
          avgDuration: number
        }>(sql`
          SELECT
            DATE_TRUNC('day', vs.created_at)::date::text as day,
            COUNT(*)::int as "totalSessions",
            COUNT(*) FILTER (WHERE vs.is_bounce = true)::int as "bouncedSessions",
            COALESCE(AVG(vs.duration) FILTER (WHERE vs.duration > 0 AND vs.duration < 7200), 0)::float as "avgDuration"
          FROM visitor_sessions vs
          ${device || browser || os || country || city ? sql`INNER JOIN visitors v ON v.visitor_id = vs.visitor_id AND v.website_id = vs.website_id` : sql``}
          WHERE ${sql.join(sessionWhereParts, sql` AND `)}
          ${device ? sql`AND v.device = ${device}` : sql``}
          ${browser ? sql`AND v.browser = ${browser}` : sql``}
          ${os ? sql`AND v.os = ${os}` : sql``}
          ${country ? sql`AND v.country = ${country}` : sql``}
          ${city ? sql`AND v.city = ${city}` : sql``}
          GROUP BY DATE_TRUNC('day', vs.created_at)
        `),
      ])

      const pvByDay = new Map(pageViewsByDay.map((r) => [r.day, r]))
      const sessByDay = new Map(sessionsByDay.map((r) => [r.day, r]))

      const hasActiveFilters = !!(device || browser || os || country || city || source || medium || campaign || referrer)

      const rowsByDay = new Map<string, { date: string; pageViews: number; uniqueVisitors: number; bounceRate: number; avgSessionDuration: number }>()
      const allDays = new Set([...pvByDay.keys(), ...sessByDay.keys()])
      for (const day of allDays) {
        const pv = pvByDay.get(day)
        const sess = sessByDay.get(day)
        rowsByDay.set(day, {
          date: day,
          pageViews: pv?.pageViews ?? 0,
          uniqueVisitors: pv?.uniqueVisitors ?? 0,
          bounceRate: sess && sess.totalSessions > 0
            ? (sess.bouncedSessions / sess.totalSessions) * 100 : 0,
          avgSessionDuration: sess?.avgDuration ?? 0,
        })
      }

      // Fill every day in range with zeros so charts always render a full time series
      // Clamp start to first day with data so charts don't have years of empty space
      const filledRows: Array<{ date: string; pageViews: number; uniqueVisitors: number; bounceRate: number; avgSessionDuration: number }> = []
      const dataKeys = [...pvByDay.keys(), ...sessByDay.keys()].sort()
      const firstDataDate = dataKeys.length > 0 ? new Date(dataKeys[0] + "T00:00:00Z") : null
      const clampedStart = firstDataDate && firstDataDate > startDate ? firstDataDate : startDate
      const cursor = new Date(clampedStart)
      cursor.setUTCHours(0, 0, 0, 0)
      const rangeEnd = new Date(endDate)
      rangeEnd.setUTCHours(23, 59, 59, 999)
      while (cursor <= rangeEnd) {
        const dateKey = cursor.toISOString().slice(0, 10)
        filledRows.push(
          rowsByDay.get(dateKey) ?? { date: dateKey, pageViews: 0, uniqueVisitors: 0, bounceRate: 0, avgSessionDuration: 0 }
        )
        cursor.setUTCDate(cursor.getUTCDate() + 1)
      }
      analyticsRows = filledRows

      const sorted = analyticsRows.sort((a, b) => (a.date < b.date ? -1 : 1))

      // Summary KPIs directly from page_views (imported + live data in same table)
      const [summaryResult, periodSessionStats] = await Promise.all([
        ctx.db.execute<{ pv: number; uv: number }>(
          hasActiveFilters
            ? sql`
                SELECT COUNT(*)::int as pv, COUNT(DISTINCT pv.visitor_id)::int as uv
                FROM page_views pv
                INNER JOIN visitors v ON v.visitor_id = pv.visitor_id AND v.website_id = pv.website_id
                LEFT JOIN visitor_sessions vs ON vs.session_id = pv.session_id
                WHERE ${sql.join(whereParts, sql` AND `)}
              `
            : sql`
                SELECT COUNT(*)::int as pv, COUNT(DISTINCT visitor_id)::int as uv
                FROM page_views
                WHERE website_id = ${websiteId}
                  AND timestamp >= ${startDate.toISOString()}
                  AND timestamp <= ${endDate.toISOString()}
              `
        ),
        ctx.db
          .select({
            avgBounce: sql<number>`coalesce(avg(case when ${visitorSessions.isBounce} then 100.0 else 0.0 end), 0)`,
            avgDuration: sql<number>`coalesce(avg(${visitorSessions.duration}) filter (where ${visitorSessions.duration} > 0 and ${visitorSessions.duration} < 7200), 0)`,
          })
          .from(visitorSessions)
          .where(and(
            sql`${visitorSessions.websiteId} = ${websiteId}`,
            sql`${visitorSessions.createdAt} >= ${startDate.toISOString()}`,
            sql`${visitorSessions.createdAt} <= ${endDate.toISOString()}`
          )),
      ])

      const summary = (summaryResult as unknown as Array<{ pv: number; uv: number }>)[0]
      const totalPageViews = Number(summary?.pv ?? 0)
      const totalUniqueVisitors = Number(summary?.uv ?? 0)
      const avgBounceRate = Number(periodSessionStats[0]?.avgBounce ?? 0)
      const avgSessionDuration = Number(periodSessionStats[0]?.avgDuration ?? 0)

      return {
        website: { id: website.id, name: website.name, url: website.url },
        dateRange: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
        summary: {
          totalPageViews,
          totalUniqueVisitors,
          avgBounceRate,
          avgSessionDuration,
          trend: {
            pageViews: 0,
            uniqueVisitors: 0,
            bounceRate: 0,
            sessionDuration: 0,
          },
        },
        data: sorted,
      }
    }),

  stats: protectedProcedure.input(statsByIdSchema).query(async ({ ctx, input }) => {
    const websiteId = input.websiteId

    const website = await ensureWebsiteAccess(ctx.db, websiteId, ctx.session!.user.id)
    const excludedPaths = (website.excludedPaths as string[] | null) ?? []
    const today = input.endDate ? new Date(input.endDate + "T23:59:59Z") : new Date()
    const last30Days = input.startDate ? new Date(input.startDate + "T00:00:00Z") : new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000)
    
    // Build excluded paths conditions for SQL
    const excludedConditions = excludedPaths.length > 0
      ? excludedPaths.map(pattern => {
          const sqlPattern = pattern.replace(/\*/g, '%')
          return sql`${pageViews.page} NOT LIKE ${sqlPattern}`
        })
      : []

    const todayStart = new Date(today.toDateString()).toISOString()

    const pageViewsCountWhere = [
      eq(pageViews.websiteId, websiteId),
      sql`${pageViews.timestamp} >= ${last30Days.toISOString()}`,
      sql`${pageViews.timestamp} <= ${today.toISOString()}`
    ]
    if (excludedConditions.length > 0) {
      pageViewsCountWhere.push(sql`${sql.join(excludedConditions, sql` AND `)}`)
    }

    const pageViewsTodayWhere = [
      eq(pageViews.websiteId, websiteId),
      sql`${pageViews.timestamp} >= ${todayStart}`
    ]
    if (excludedConditions.length > 0) {
      pageViewsTodayWhere.push(sql`${sql.join(excludedConditions, sql` AND `)}`)
    }

    const topPagesWhere = [
      eq(pageViews.websiteId, websiteId),
      sql`${pageViews.timestamp} >= ${last30Days.toISOString()}`,
      sql`${pageViews.timestamp} <= ${today.toISOString()}`
    ]
    if (excludedConditions.length > 0) {
      topPagesWhere.push(sql`${sql.join(excludedConditions, sql` AND `)}`)
    }

    // Run all independent queries in parallel
    const [
      visitorsCount,
      visitorsToday,
      pageViewsCount,
      pageViewsToday,
      sessionStatsResult,
      topPages,
      topCountries,
      devices,
      browsers,
      osList,
    ] = await Promise.all([
      ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(visitors)
        .where(and(eq(visitors.websiteId, websiteId), sql`${visitors.createdAt} >= ${last30Days.toISOString()}`, sql`${visitors.createdAt} <= ${today.toISOString()}`)),

      ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(visitors)
        .where(and(eq(visitors.websiteId, websiteId), sql`${visitors.createdAt} >= ${todayStart}`, sql`${visitors.createdAt} <= ${today.toISOString()}`)),

      ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(pageViews)
        .where(and(...pageViewsCountWhere)),

      ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(pageViews)
        .where(and(...pageViewsTodayWhere)),

      ctx.db
        .select({
          totalSessions: sql<number>`count(*)`,
          bouncedSessions: sql<number>`count(*) filter (where ${visitorSessions.isBounce} = true)`,
          avgDuration: sql<number>`coalesce(avg(${visitorSessions.duration}) filter (where ${visitorSessions.duration} > 0 and ${visitorSessions.duration} < 7200), 0)`,
        })
        .from(visitorSessions)
        .where(and(eq(visitorSessions.websiteId, websiteId), sql`${visitorSessions.createdAt} >= ${last30Days.toISOString()}`, sql`${visitorSessions.createdAt} <= ${today.toISOString()}`)),

      ctx.db
        .select({ page: pageViews.page, count: sql<number>`count(*)` })
        .from(pageViews)
        .where(and(...topPagesWhere))
        .groupBy(pageViews.page)
        .orderBy(desc(sql`count(*)`))
        .limit(5),

      ctx.db
        .select({ country: visitors.country, count: sql<number>`count(*)` })
        .from(visitors)
        .where(and(eq(visitors.websiteId, websiteId), sql`${visitors.country} IS NOT NULL`, sql`${visitors.createdAt} >= ${last30Days.toISOString()}`, sql`${visitors.createdAt} <= ${today.toISOString()}`))
        .groupBy(visitors.country)
        .orderBy(desc(sql`count(*)`))
        .limit(5),

      ctx.db
        .select({ device: visitors.device, count: sql<number>`count(*)` })
        .from(visitors)
        .where(and(eq(visitors.websiteId, websiteId), sql`${visitors.createdAt} >= ${last30Days.toISOString()}`, sql`${visitors.createdAt} <= ${today.toISOString()}`))
        .groupBy(visitors.device)
        .orderBy(desc(sql`count(*)`))
        .limit(20),

      ctx.db
        .select({ browser: visitors.browser, count: sql<number>`count(*)` })
        .from(visitors)
        .where(and(eq(visitors.websiteId, websiteId), sql`${visitors.browser} IS NOT NULL`, sql`${visitors.createdAt} >= ${last30Days.toISOString()}`, sql`${visitors.createdAt} <= ${today.toISOString()}`))
        .groupBy(visitors.browser)
        .orderBy(desc(sql`count(*)`))
        .limit(8),

      ctx.db
        .select({ os: visitors.os, count: sql<number>`count(*)` })
        .from(visitors)
        .where(and(eq(visitors.websiteId, websiteId), sql`${visitors.os} IS NOT NULL`, sql`${visitors.createdAt} >= ${last30Days.toISOString()}`, sql`${visitors.createdAt} <= ${today.toISOString()}`))
        .groupBy(visitors.os)
        .orderBy(desc(sql`count(*)`))
        .limit(8),
    ])

    const totalSessions = Number(sessionStatsResult[0]?.totalSessions ?? 0)
    const bouncedSessions = Number(sessionStatsResult[0]?.bouncedSessions ?? 0)
    const bounceRate = totalSessions > 0 ? (bouncedSessions / totalSessions) * 100 : 0
    const avgSessionDuration = Number(sessionStatsResult[0]?.avgDuration ?? 0)

    const last7DaysStart = new Date(today)
    last7DaysStart.setDate(last7DaysStart.getDate() - 6)
    last7DaysStart.setHours(0, 0, 0, 0)

    const last7DaysWhere = [
      eq(pageViews.websiteId, websiteId),
      sql`${pageViews.timestamp} >= ${last7DaysStart.toISOString()}`,
    ]
    if (excludedConditions.length > 0) {
      last7DaysWhere.push(sql`${sql.join(excludedConditions, sql` AND `)}`)
    }

    const last7DaysRaw = await ctx.db
      .select({
        day: sql<string>`DATE_TRUNC('day', ${pageViews.timestamp})::date::text`,
        views: sql<number>`count(*)`,
      })
      .from(pageViews)
      .where(and(...last7DaysWhere))
      .groupBy(sql`DATE_TRUNC('day', ${pageViews.timestamp})`)
      .orderBy(sql`DATE_TRUNC('day', ${pageViews.timestamp})`)

    const viewsByDay = new Map(last7DaysRaw.map((r) => [r.day, Number(r.views)]))

    const last7DaysData = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(last7DaysStart)
      d.setDate(d.getDate() + i)
      const dateKey = d.toISOString().slice(0, 10)
      return { date: dateKey, views: viewsByDay.get(dateKey) ?? 0 }
    })

    return {
      visitors: Number(visitorsCount[0]?.count ?? 0),
      visitorsToday: Number(visitorsToday[0]?.count ?? 0),
      pageViews: Number(pageViewsCount[0]?.count ?? 0),
      pageViewsToday: Number(pageViewsToday[0]?.count ?? 0),
      bounceRate,
      avgSessionDuration,
      topPages: topPages.map((p) => ({ page: p.page ?? "Unknown", views: Number(p.count) })),
      topCountries: topCountries.map((c) => ({ country: c.country ?? "Unknown", visitors: Number(c.count) })),
      deviceBreakdown: devices.map((d) => ({ device: d.device ?? "Bots / Other", count: Number(d.count) })),
      browserBreakdown: browsers.map((b) => ({ browser: b.browser ?? "Bots / Other", count: Number(b.count) })),
      osBreakdown: osList.map((o) => ({ os: o.os ?? "Bots / Other", count: Number(o.count) })),
      last7DaysData,
    }
  }),

  devices: protectedProcedure.input(deviceQuerySchema).query(async ({ ctx, input }) => {
    const { websiteId, startDate: startDateStr, endDate: endDateStr, browser, os, country, city, source, medium, campaign, referrer } = input
    const userId = ctx.session!.user.id
    const website = await ensureWebsiteAccess(ctx.db, websiteId, userId)
    const excludedPaths = (website.excludedPaths as string[] | null) ?? []

    let startDate: Date
    let endDate: Date

    if (startDateStr) {
      startDate = parseUTCDate(startDateStr, false)
    } else {
      const d = new Date()
      d.setUTCDate(d.getUTCDate() - 30)
      startDate = utcStartOfDay(d)
    }

    if (endDateStr) {
      endDate = parseUTCDate(endDateStr, true)
    } else {
      endDate = utcEndOfDay()
    }

    const whereParts = [
      sql`pv.website_id = ${websiteId}`,
      sql`pv.timestamp >= ${startDate.toISOString()}`,
      sql`pv.timestamp <= ${endDate.toISOString()}`,
    ]
    
    // Add excluded paths filter
    if (excludedPaths.length > 0) {
      const excludedConditions = excludedPaths.map(pattern => {
        const sqlPattern = pattern.replace(/\*/g, '%')
        return sql`pv.page NOT LIKE ${sqlPattern}`
      })
      whereParts.push(sql`${sql.join(excludedConditions, sql` AND `)}`)
    }
    
    if (browser) whereParts.push(sql`v.browser = ${browser}`)
    if (os) whereParts.push(sql`v.os = ${os}`)
    if (country) whereParts.push(sql`v.country = ${country}`)
    if (city) whereParts.push(sql`v.city = ${city}`)
    if (source) whereParts.push(sql`vs.source = ${source}`)
    if (medium) whereParts.push(sql`vs.medium = ${medium}`)
    if (campaign) whereParts.push(sql`vs.utm_campaign = ${campaign}`)
    if (referrer) whereParts.push(sql`vs.referrer ILIKE ${`%${referrer}%`}`)

    const query = sql`
      SELECT v.device, COUNT(*)::bigint as count
      FROM page_views pv
      INNER JOIN visitors v ON v.visitor_id = pv.visitor_id AND v.website_id = pv.website_id
      LEFT JOIN visitor_sessions vs ON vs.session_id = pv.session_id
      WHERE ${sql.join(whereParts, sql` AND `)}
      GROUP BY v.device
      ORDER BY count DESC
      LIMIT 50
    `

    const rows = await ctx.db.execute<{ device: string | null; count: bigint }>(query)
    const total = rows.reduce((acc, r) => acc + Number(r.count), 0)
    return rows.map((r) => ({
      name: r.device ?? "Bots / Other",
      value: total > 0 ? Math.round((Number(r.count) / total) * 100) : 0,
      count: Number(r.count),
    }))
  }),

  pages: protectedProcedure.input(pagesQuerySchema).query(async ({ ctx, input }) => {
    const {
      websiteId,
      startDate: startDateStr,
      endDate: endDateStr,
      limit = 5,
      device,
      browser,
      os,
      country,
      city,
      source,
      medium,
      campaign,
      referrer,
    } = input
    const website = await ensureWebsiteAccess(ctx.db, websiteId, ctx.session!.user.id)

    let startDate: Date
    let endDate: Date

    if (startDateStr) {
      startDate = parseUTCDate(startDateStr, false)
    } else {
      const d = new Date()
      d.setUTCDate(d.getUTCDate() - 30)
      startDate = utcStartOfDay(d)
    }

    if (endDateStr) {
      endDate = parseUTCDate(endDateStr, true)
    } else {
      endDate = utcEndOfDay()
    }

    const hasFilters = device || browser || os || country || city || source || medium || campaign || referrer

    const excludedPaths = (website.excludedPaths as string[] | null) ?? []
    const excludedConditions = excludedPaths.length > 0
      ? excludedPaths.map(pattern => {
          const sqlPattern = pattern.replace(/\*/g, '%')
          return sql`${pageViews.page} NOT LIKE ${sqlPattern}`
        })
      : []

    if (!hasFilters) {
      const whereConditions = [
        eq(pageViews.websiteId, websiteId),
        sql`${pageViews.timestamp} >= ${startDate.toISOString()}`,
        sql`${pageViews.timestamp} <= ${endDate.toISOString()}`
      ]
      if (excludedConditions.length > 0) {
        whereConditions.push(sql`${sql.join(excludedConditions, sql` AND `)}`)
      }

      const rows = await ctx.db
        .select({
          page: pageViews.page,
          count: sql<number>`count(*)`,
        })
        .from(pageViews)
        .where(and(...whereConditions))
        .groupBy(pageViews.page)
        .orderBy(desc(sql`count(*)`))
        .limit(limit)

      const totalViews = rows.reduce((sum, r) => sum + Number(r.count), 0)
      return rows.map((r) => ({
        page: r.page ?? "Unknown",
        views: Number(r.count),
        percentage: totalViews > 0 ? Math.round((Number(r.count) / totalViews) * 100) : 0,
      }))
    }

    const whereParts = [
      sql`pv.website_id = ${websiteId}`,
      sql`pv.timestamp >= ${startDate.toISOString()}`,
      sql`pv.timestamp <= ${endDate.toISOString()}`,
    ]
    
    // Add excluded paths filter
    if (excludedPaths.length > 0) {
      const excludedConditions = excludedPaths.map(pattern => {
        const sqlPattern = pattern.replace(/\*/g, '%')
        return sql`pv.page NOT LIKE ${sqlPattern}`
      })
      whereParts.push(sql`${sql.join(excludedConditions, sql` AND `)}`)
    }
    
    if (device) whereParts.push(sql`v.device = ${device}`)
    if (browser) whereParts.push(sql`v.browser = ${browser}`)
    if (os) whereParts.push(sql`v.os = ${os}`)
    if (country) whereParts.push(sql`v.country = ${country}`)
    if (city) whereParts.push(sql`v.city = ${city}`)
    if (source) whereParts.push(sql`vs.source = ${source}`)
    if (medium) whereParts.push(sql`vs.medium = ${medium}`)
    if (campaign) whereParts.push(sql`vs.utm_campaign = ${campaign}`)
    if (referrer) whereParts.push(sql`vs.referrer ILIKE ${`%${referrer}%`}`)

    const query = sql`
      SELECT pv.page, COUNT(*)::bigint as views
      FROM page_views pv
      INNER JOIN visitors v ON v.visitor_id = pv.visitor_id AND v.website_id = pv.website_id
      LEFT JOIN visitor_sessions vs ON vs.session_id = pv.session_id
      WHERE ${sql.join(whereParts, sql` AND `)}
      GROUP BY pv.page
      ORDER BY views DESC
      LIMIT ${limit}
    `

    const rows = await ctx.db.execute<{ page: string | null; views: bigint }>(query)
    const totalViews = rows.reduce((sum, r) => sum + Number(r.views), 0)
    return rows.map((r) => ({
      page: r.page ?? "Unknown",
      views: Number(r.views),
      percentage: totalViews > 0 ? Math.round((Number(r.views) / totalViews) * 100) : 0,
    }))
  }),

  traffic: protectedProcedure.input(trafficQuerySchema).query(async ({ ctx, input }) => {
    const { websiteId, startDate, endDate } = input
    await ensureWebsiteAccess(ctx.db, websiteId, ctx.session!.user.id)

    const end = endDate ? new Date(endDate) : new Date()
    end.setHours(23, 59, 59, 999)
    const start = startDate ? new Date(startDate) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    start.setHours(0, 0, 0, 0)

    const sources = await ctx.db
      .select({
        source: visitorSessions.source,
        count: sql<number>`count(*)`,
      })
      .from(visitorSessions)
      .where(
        and(
          eq(visitorSessions.websiteId, websiteId),
          sql`${visitorSessions.createdAt} >= ${start.toISOString()}`,
          sql`${visitorSessions.createdAt} <= ${end.toISOString()}`,
          sql`${visitorSessions.source} IS NOT NULL`
        )
      )
      .groupBy(visitorSessions.source)
      .orderBy(desc(sql`count(*)`))

    const totalVisitors = sources.reduce((sum, s) => sum + Number(s.count), 0)
    const trafficSources = sources.map((s) => {
      // Normalize source names: strip www., lowercase, trim
      let name = (s.source ?? "Unknown").trim().toLowerCase().replace(/^www\./, "")
      // Capitalize first letter only (not CSS capitalize which breaks on dots)
      name = name.charAt(0).toUpperCase() + name.slice(1)
      return {
        source: name,
        visitors: Number(s.count),
        percentage: totalVisitors > 0 ? Math.round((Number(s.count) / totalVisitors) * 100) : 0,
      }
    })

    const campaigns = await ctx.db
      .select({
        utmCampaign: visitorSessions.utmCampaign,
        utmSource: visitorSessions.utmSource,
        count: sql<number>`count(*)`,
      })
      .from(visitorSessions)
      .where(
        and(
          eq(visitorSessions.websiteId, websiteId),
          sql`${visitorSessions.createdAt} >= ${start.toISOString()}`,
          sql`${visitorSessions.createdAt} <= ${end.toISOString()}`,
          sql`${visitorSessions.utmCampaign} IS NOT NULL`
        )
      )
      .groupBy(visitorSessions.utmCampaign, visitorSessions.utmSource)
      .orderBy(desc(sql`count(*)`))
      .limit(10)

    const referrers = await ctx.db
      .select({
        referrer: sql<string>`COALESCE(${visitorSessions.referrerDomain}, ${visitorSessions.referrer})`.as("referrer"),
        count: sql<number>`count(*)`,
      })
      .from(visitorSessions)
      .where(
        and(
          eq(visitorSessions.websiteId, websiteId),
          sql`${visitorSessions.createdAt} >= ${start.toISOString()}`,
          sql`${visitorSessions.createdAt} <= ${end.toISOString()}`,
          sql`${visitorSessions.referrer} IS NOT NULL`,
          sql`${visitorSessions.referrer} <> ''`
        )
      )
      .groupBy(sql`COALESCE(${visitorSessions.referrerDomain}, ${visitorSessions.referrer})`)
      .orderBy(desc(sql`count(*)`))
      .limit(10)

    return {
      sources: trafficSources,
      campaigns: campaigns.map((c) => ({
        campaign: c.utmCampaign ?? "Unknown",
        source: c.utmSource ?? "Unknown",
        visitors: Number(c.count),
      })),
      referrers: referrers.map((r) => ({
        referrer: r.referrer ?? "Unknown",
        visitors: Number(r.count),
      })),
    }
  }),

  mapLocations: protectedProcedure
    .input(z.object({
      websiteId: z.string(),
      startDate: z.string().nullish(),
      endDate: z.string().nullish(),
    }))
    .query(async ({ ctx, input }) => {
      const now = new Date()
      const start = input.startDate ? new Date(input.startDate) : new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
      const end = input.endDate ? new Date(input.endDate) : now

      const rows = await ctx.db
        .select({
          city: visitors.city,
          country: visitors.country,
          lat: visitors.lat,
          lon: visitors.lon,
          count: sql<number>`count(distinct ${visitors.visitorId})`,
        })
        .from(visitors)
        .where(and(
          eq(visitors.websiteId, input.websiteId),
          sql`${visitors.lat} IS NOT NULL`,
          sql`${visitors.lon} IS NOT NULL`,
          sql`${visitors.lastVisit} >= ${start.toISOString()}`,
          sql`${visitors.lastVisit} <= ${end.toISOString()}`,
        ))
        .groupBy(visitors.city, visitors.country, visitors.lat, visitors.lon)
        .orderBy(desc(sql`count(distinct ${visitors.visitorId})`))
        .limit(100)

      return rows.map((r) => ({
        city: r.city ?? 'Unknown',
        country: r.country ?? 'Unknown',
        lat: Number(r.lat),
        lon: Number(r.lon),
        visitors: Number(r.count),
      }))
    }),
})

