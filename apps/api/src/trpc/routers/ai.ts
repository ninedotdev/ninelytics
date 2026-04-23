import { z } from "zod"
import { router, protectedProcedure } from "../trpc"
import { db } from "@ninelytics/shared/db"
import { websites, userWebsiteAccess, pageViews, visitors, visitorSessions, searchConsoleData, stripeData, webVitals } from "@ninelytics/db/schema"
import { eq, and, or, sql, gte, lte, count, desc } from "drizzle-orm"
import { generateAIInsights } from "@ninelytics/shared/ai-service"
import { detectAnomalies, generatePredictions, generateRecommendations } from "@ninelytics/shared/ai-analytics"
import type { AnalyticsSnapshot } from "@ninelytics/shared/types/ai"
import { subDays } from "date-fns"

interface DailyMetrics {
  date: Date
  visitors: number
  pageViews: number
  bounceRate: number
  avgSessionDuration: number
}

interface AnalyticsData {
  current: {
    visitors: number
    pageViews: number
    bounceRate: number
    avgSessionDuration: number
  }
  historical: DailyMetrics[]
  topPages: Array<{ page: string; views: number; bounceRate?: number }>
  deviceData: Array<{ name: string; count: number; bounceRate?: number }>
  totalVisitors: number
}

async function ensureWebsiteAccess(
  dbInstance: typeof db,
  websiteId: string,
  userId: string
) {
  const rows = await dbInstance
    .select({
      id: websites.id,
      name: websites.name,
      url: websites.url,
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

// Helper function to get analytics snapshot for AI insights
async function getAnalyticsSnapshot(
  dbInstance: typeof db,
  websiteId: string,
  days: number
): Promise<AnalyticsSnapshot> {
  const website = await dbInstance.query.websites.findFirst({
    where: eq(websites.id, websiteId),
    columns: {
      id: true,
      name: true,
      description: true,
    },
  })

  if (!website) {
    throw new Error("Website not found")
  }

  const endDate = new Date()
  const startDate = subDays(endDate, days)

  // Get current period metrics — use pageViews for visitor count (includes returning visitors)
  const [currentVisitorsResult, currentPageViewsResult, currentSessionsResult] = await Promise.all([
    dbInstance.execute<{ count: string }>(sql`
      SELECT COUNT(DISTINCT visitor_id) as count FROM page_views
      WHERE website_id = ${websiteId}
        AND timestamp >= ${startDate.toISOString()}
        AND timestamp <= ${endDate.toISOString()}
    `),
    dbInstance.select({ count: count() }).from(pageViews).where(
      and(
        eq(pageViews.websiteId, websiteId),
        gte(pageViews.timestamp, startDate.toISOString()),
        lte(pageViews.timestamp, endDate.toISOString())
      )
    ),
    dbInstance.select({
      isBounce: visitorSessions.isBounce,
      duration: visitorSessions.duration,
    }).from(visitorSessions).where(
      and(
        eq(visitorSessions.websiteId, websiteId),
        gte(visitorSessions.createdAt, startDate.toISOString()),
        lte(visitorSessions.createdAt, endDate.toISOString())
      )
    ),
  ])

  const totalVisitors = Number((currentVisitorsResult as unknown as Array<{ count: string }>)[0]?.count ?? 0)
  const totalPageViews = Number(currentPageViewsResult[0]?.count ?? 0)
  const sessions = currentSessionsResult
  const bounceCount = sessions.filter(s => s.isBounce).length
  const bounceRate = sessions.length > 0 ? (bounceCount / sessions.length) * 100 : 0
  const avgSessionDuration = sessions.length > 0
    ? Math.round(sessions.reduce((sum, s) => sum + (s.duration ?? 0), 0) / sessions.length)
    : 0

  // Get previous period for trends — use pageViews for visitor count (includes returning visitors)
  const prevStartDate = subDays(startDate, days)
  const [prevVisitorsResult, prevPageViewsResult, prevSessionsResult] = await Promise.all([
    dbInstance.execute<{ count: string }>(sql`
      SELECT COUNT(DISTINCT visitor_id) as count FROM page_views
      WHERE website_id = ${websiteId}
        AND timestamp >= ${prevStartDate.toISOString()}
        AND timestamp <= ${startDate.toISOString()}
    `),
    dbInstance.select({ count: count() }).from(pageViews).where(
      and(
        eq(pageViews.websiteId, websiteId),
        gte(pageViews.timestamp, prevStartDate.toISOString()),
        lte(pageViews.timestamp, startDate.toISOString())
      )
    ),
    dbInstance.select({ isBounce: visitorSessions.isBounce }).from(visitorSessions).where(
      and(
        eq(visitorSessions.websiteId, websiteId),
        gte(visitorSessions.createdAt, prevStartDate.toISOString()),
        lte(visitorSessions.createdAt, startDate.toISOString())
      )
    ),
  ])

  const prevVisitors = Number((prevVisitorsResult as unknown as Array<{ count: string }>)[0]?.count ?? 0)
  const prevPageViews = Number(prevPageViewsResult[0]?.count ?? 0)
  const prevBounceRate = prevSessionsResult.length > 0
    ? (prevSessionsResult.filter(s => s.isBounce).length / prevSessionsResult.length) * 100
    : 0

  const visitorsChange = prevVisitors > 0 ? ((totalVisitors - prevVisitors) / prevVisitors) * 100 : 0
  const pageViewsChange = prevPageViews > 0 ? ((totalPageViews - prevPageViews) / prevPageViews) * 100 : 0
  const bounceRateChange = prevBounceRate > 0 ? bounceRate - prevBounceRate : 0

  // Get top pages
  const topPagesResult = await dbInstance.execute<{ page: string; views: bigint }>(sql`
    SELECT page, COUNT(*) as views
    FROM page_views
    WHERE website_id = ${websiteId}
      AND timestamp >= ${startDate.toISOString()}
      AND timestamp <= ${endDate.toISOString()}
    GROUP BY page
    ORDER BY views DESC
    LIMIT 5
  `)
  const topPages = (topPagesResult as unknown as Array<{ page: string; views: bigint }>).map(p => ({
    page: p.page,
    views: Number(p.views),
  }))

  // Get top sources
  const topSourcesResult = await dbInstance.execute<{ referrer: string | null; visitors: bigint }>(sql`
    SELECT referrer, COUNT(DISTINCT visitor_id) as visitors
    FROM visitor_sessions
    WHERE website_id = ${websiteId}
      AND created_at >= ${startDate.toISOString()}
      AND created_at <= ${endDate.toISOString()}
    GROUP BY referrer
    ORDER BY visitors DESC
    LIMIT 5
  `)
  const topSources = (topSourcesResult as unknown as Array<{ referrer: string | null; visitors: bigint }>).map(s => ({
    source: s.referrer || 'Direct',
    visitors: Number(s.visitors),
  }))

  // Get device breakdown
  const deviceResult = await dbInstance.execute<{ device: string | null; count: bigint }>(sql`
    SELECT device, COUNT(*) as count
    FROM visitors
    WHERE website_id = ${websiteId}
      AND created_at >= ${startDate.toISOString()}
      AND created_at <= ${endDate.toISOString()}
    GROUP BY device
  `)
  const deviceTotal = deviceResult ? (deviceResult as unknown as Array<{ count: bigint }>).reduce((sum, d) => sum + Number(d.count), 0) : 0
  const deviceBreakdown = deviceResult ? (deviceResult as unknown as Array<{ device: string | null; count: bigint }>).map(d => ({
    device: d.device || 'Unknown',
    percentage: deviceTotal > 0 ? Math.round((Number(d.count) / deviceTotal) * 100) : 0,
  })) : []

  // Search Console data (if linked)
  const websiteFull = await dbInstance.query.websites.findFirst({
    where: eq(websites.id, websiteId),
    columns: { searchConsoleSiteUrl: true },
  })

  let searchConsole: AnalyticsSnapshot["searchConsole"] = undefined

  if (websiteFull?.searchConsoleSiteUrl) {
    const startDateStr = startDate.toISOString().slice(0, 10)
    const endDateStr = endDate.toISOString().slice(0, 10)

    const [scAgg, scTopQueries, scTopPages] = await Promise.all([
      // Aggregates
      dbInstance.execute<{ total_clicks: string; total_impressions: string; avg_ctr: string; avg_position: string }>(sql`
        SELECT
          COALESCE(SUM(clicks), 0) as total_clicks,
          COALESCE(SUM(impressions), 0) as total_impressions,
          CASE WHEN SUM(impressions) > 0 THEN SUM(clicks)::float / SUM(impressions) ELSE 0 END as avg_ctr,
          CASE WHEN COUNT(*) > 0 THEN AVG(position::float) ELSE 0 END as avg_position
        FROM search_console_data
        WHERE website_id = ${websiteId}
          AND record_date >= ${startDateStr}
          AND record_date <= ${endDateStr}
      `),
      // Top queries by clicks
      dbInstance.execute<{ query: string; clicks: string; impressions: string; ctr: string; position: string }>(sql`
        SELECT
          query,
          SUM(clicks) as clicks,
          SUM(impressions) as impressions,
          CASE WHEN SUM(impressions) > 0 THEN SUM(clicks)::float / SUM(impressions) ELSE 0 END as ctr,
          AVG(position::float) as position
        FROM search_console_data
        WHERE website_id = ${websiteId}
          AND record_date >= ${startDateStr}
          AND record_date <= ${endDateStr}
        GROUP BY query
        ORDER BY SUM(clicks) DESC
        LIMIT 10
      `),
      // Top pages by clicks
      dbInstance.execute<{ page: string; clicks: string; impressions: string; ctr: string; position: string }>(sql`
        SELECT
          page,
          SUM(clicks) as clicks,
          SUM(impressions) as impressions,
          CASE WHEN SUM(impressions) > 0 THEN SUM(clicks)::float / SUM(impressions) ELSE 0 END as ctr,
          AVG(position::float) as position
        FROM search_console_data
        WHERE website_id = ${websiteId}
          AND record_date >= ${startDateStr}
          AND record_date <= ${endDateStr}
        GROUP BY page
        ORDER BY SUM(clicks) DESC
        LIMIT 10
      `),
    ])

    const agg = (scAgg as unknown as Array<Record<string, string>>)[0]
    if (agg && Number(agg.total_impressions) > 0) {
      searchConsole = {
        totalClicks: Number(agg.total_clicks),
        totalImpressions: Number(agg.total_impressions),
        avgCtr: Number(agg.avg_ctr),
        avgPosition: Number(agg.avg_position),
        topQueries: (scTopQueries as unknown as Array<Record<string, string>>).map(r => ({
          query: r.query,
          clicks: Number(r.clicks),
          impressions: Number(r.impressions),
          ctr: Number(r.ctr),
          position: Number(r.position),
        })),
        topPages: (scTopPages as unknown as Array<Record<string, string>>).map(r => ({
          page: r.page,
          clicks: Number(r.clicks),
          impressions: Number(r.impressions),
          ctr: Number(r.ctr),
          position: Number(r.position),
        })),
      }
    }
  }

  // Stripe revenue data (if connected)
  let stripe: AnalyticsSnapshot["stripe"] = undefined

  if (websiteFull) {
    const wFull = await dbInstance.query.websites.findFirst({
      where: eq(websites.id, websiteId),
      columns: { stripeApiKey: true },
    })

    if (wFull?.stripeApiKey) {
      const startDateStr = startDate.toISOString().slice(0, 10)
      const endDateStr = endDate.toISOString().slice(0, 10)

      const [stripeAgg, prevStripeAgg] = await Promise.all([
        dbInstance.execute<{ total_revenue: string; total_refunds: string; total_charges: string; total_customers: string; currency: string }>(sql`
          SELECT
            COALESCE(SUM(revenue), 0) as total_revenue,
            COALESCE(SUM(refunds), 0) as total_refunds,
            COALESCE(SUM(charges), 0) as total_charges,
            COALESCE(SUM(new_customers), 0) as total_customers,
            COALESCE(MAX(currency), 'usd') as currency
          FROM stripe_data
          WHERE website_id = ${websiteId}
            AND record_date >= ${startDateStr}
            AND record_date <= ${endDateStr}
        `),
        dbInstance.execute<{ total_revenue: string }>(sql`
          SELECT COALESCE(SUM(revenue), 0) as total_revenue
          FROM stripe_data
          WHERE website_id = ${websiteId}
            AND record_date >= ${subDays(startDate, days).toISOString().slice(0, 10)}
            AND record_date < ${startDateStr}
        `),
      ])

      const agg = (stripeAgg as unknown as Array<Record<string, string>>)[0]
      const prevAgg = (prevStripeAgg as unknown as Array<Record<string, string>>)[0]

      if (agg && Number(agg.total_revenue) > 0) {
        const totalRevenue = Number(agg.total_revenue)
        const prevRevenue = Number(prevAgg?.total_revenue ?? 0)
        const revenueChange = prevRevenue > 0 ? ((totalRevenue - prevRevenue) / prevRevenue) * 100 : 0

        stripe = {
          totalRevenue,
          totalRefunds: Number(agg.total_refunds),
          totalCharges: Number(agg.total_charges),
          totalNewCustomers: Number(agg.total_customers),
          currency: agg.currency,
          avgRevenuePerDay: Math.round(totalRevenue / days),
          revenueChange,
        }
      }
    }
  }

  // Speed Insights (if enabled and has data)
  let speedInsights: AnalyticsSnapshot["speedInsights"] = undefined

  const websiteWithSpeed = await dbInstance.query.websites.findFirst({
    where: eq(websites.id, websiteId),
    columns: { speedInsightsEnabled: true },
  })

  if (websiteWithSpeed?.speedInsightsEnabled) {
    const vitalsRows = await dbInstance.execute<{
      name: string; p75: string; good_pct: string; count: string
    }>(sql`
      SELECT
        name,
        percentile_cont(0.75) WITHIN GROUP (ORDER BY value) AS p75,
        ROUND(100.0 * SUM(CASE WHEN rating = 'good' THEN 1 ELSE 0 END) / COUNT(*), 1) AS good_pct,
        COUNT(*) AS count
      FROM web_vitals
      WHERE website_id = ${websiteId}
        AND recorded_at >= ${startDate.toISOString()}
      GROUP BY name
    `)

    const vitals = (vitalsRows as unknown as Array<Record<string, string>>).map(r => ({
      name: r.name,
      p75: Math.round(Number(r.p75)),
      goodPct: Number(r.good_pct),
      count: Number(r.count),
    }))

    if (vitals.length > 0 && vitals.some(v => v.count >= 5)) {
      const weights: Record<string, number> = { LCP: 0.35, INP: 0.30, FCP: 0.15, CLS: 0.15, TTFB: 0.05 }
      let score = 0, totalW = 0
      for (const v of vitals) {
        const w = weights[v.name] ?? 0
        score += (v.goodPct / 100) * w * 100
        totalW += w
      }
      speedInsights = { res: totalW > 0 ? Math.round(score / totalW) : 0, vitals }
    }
  }

  return {
    websiteId: website.id,
    websiteName: website.name ?? "",
    websiteDescription: website.description ?? undefined,
    period: {
      start: startDate,
      end: endDate,
    },
    metrics: {
      totalVisitors,
      totalPageViews,
      bounceRate,
      avgSessionDuration,
      topPages,
      topSources,
      deviceBreakdown,
    },
    trends: {
      visitorsChange,
      pageViewsChange,
      bounceRateChange,
    },
    searchConsole,
    stripe,
    speedInsights,
  }
}

// Helper function to get analytics data for anomaly detection
async function getAnalyticsData(
  dbInstance: typeof db,
  websiteId: string
): Promise<AnalyticsData> {
  const endDate = new Date()
  const startDate = subDays(endDate, 30)

  // Get current metrics
  const [currentVisitorsResult, currentPageViewsResult, currentSessionsResult] = await Promise.all([
    dbInstance.select({ count: count() }).from(visitors).where(
      and(
        eq(visitors.websiteId, websiteId),
        gte(visitors.createdAt, subDays(endDate, 1).toISOString()),
        lte(visitors.createdAt, endDate.toISOString())
      )
    ),
    dbInstance.select({ count: count() }).from(pageViews).where(
      and(
        eq(pageViews.websiteId, websiteId),
        gte(pageViews.timestamp, subDays(endDate, 1).toISOString()),
        lte(pageViews.timestamp, endDate.toISOString())
      )
    ),
    dbInstance.select({
      isBounce: visitorSessions.isBounce,
      duration: visitorSessions.duration,
    }).from(visitorSessions).where(
      and(
        eq(visitorSessions.websiteId, websiteId),
        gte(visitorSessions.createdAt, subDays(endDate, 1).toISOString()),
        lte(visitorSessions.createdAt, endDate.toISOString())
      )
    ),
  ])

  const currentVisitors = Number(currentVisitorsResult[0]?.count ?? 0)
  const currentPageViews = Number(currentPageViewsResult[0]?.count ?? 0)
  const sessions = currentSessionsResult
  const bounceCount = sessions.filter(s => s.isBounce).length
  const currentBounceRate = sessions.length > 0 ? (bounceCount / sessions.length) * 100 : 0
  const currentAvgSessionDuration = sessions.length > 0
    ? Math.round(sessions.reduce((sum, s) => sum + (s.duration ?? 0), 0) / sessions.length)
    : 0

  // Run all independent queries in parallel
  const [dailyResult, topPagesResult, deviceResult, totalVisitorsResult] = await Promise.all([
    // Historical daily metrics — use page_views (works with both live and imported data)
    dbInstance.execute<{
      date: string
      visitors: bigint
      pageViews: bigint
      bounceRate: number
      avgSessionDuration: number
    }>(sql`
      SELECT
        pv.timestamp::date::text as date,
        COUNT(DISTINCT pv.visitor_id) as visitors,
        COUNT(*) as page_views,
        COALESCE(AVG(CASE WHEN s.is_bounce THEN 100 ELSE 0 END), 0) as bounce_rate,
        COALESCE(AVG(s.duration), 0) as avg_session_duration
      FROM page_views pv
      LEFT JOIN visitor_sessions s ON s.visitor_id = pv.visitor_id AND s.website_id = pv.website_id
      WHERE pv.website_id = ${websiteId}
        AND pv.timestamp >= ${startDate.toISOString()}
        AND pv.timestamp <= ${endDate.toISOString()}
      GROUP BY pv.timestamp::date
      ORDER BY date ASC
    `),

    // Top pages
    dbInstance.execute<{ page: string; views: bigint; bounceRate: number }>(sql`
      SELECT
        p.page,
        COUNT(*) as views,
        AVG(CASE WHEN s.is_bounce THEN 100 ELSE 0 END) as bounce_rate
      FROM page_views p
      LEFT JOIN visitor_sessions s ON s.visitor_id = p.visitor_id AND s.website_id = p.website_id
      WHERE p.website_id = ${websiteId}
        AND p.timestamp >= ${startDate.toISOString()}
      GROUP BY p.page
      ORDER BY views DESC
      LIMIT 10
    `),

    // Device data
    dbInstance.execute<{ device: string | null; count: bigint; bounceRate: number }>(sql`
      SELECT
        v.device,
        COUNT(*) as count,
        AVG(CASE WHEN s.is_bounce THEN 100 ELSE 0 END) as bounce_rate
      FROM visitors v
      LEFT JOIN visitor_sessions s ON s.visitor_id = v.visitor_id AND s.website_id = v.website_id
      WHERE v.website_id = ${websiteId}
        AND v.created_at >= ${startDate.toISOString()}
      GROUP BY v.device
    `),

    // Total visitors
    dbInstance.select({ count: count() }).from(visitors).where(
      and(
        eq(visitors.websiteId, websiteId),
        gte(visitors.createdAt, startDate.toISOString()),
        lte(visitors.createdAt, endDate.toISOString())
      )
    ),
  ])

  const historical = (dailyResult as unknown as Array<{
    date: string; visitors: bigint; pageViews: bigint; bounceRate: number; avgSessionDuration: number
  }>).map(d => ({
    date: new Date(d.date),
    visitors: Number(d.visitors),
    pageViews: Number(d.pageViews),
    bounceRate: Number(d.bounceRate),
    avgSessionDuration: Number(d.avgSessionDuration),
  }))

  const topPages = (topPagesResult as unknown as Array<{ page: string; views: bigint; bounceRate: number }>).map(p => ({
    page: p.page,
    views: Number(p.views),
    bounceRate: Number(p.bounceRate),
  }))

  const deviceData = (deviceResult as unknown as Array<{ device: string | null; count: bigint; bounceRate: number }>).map(d => ({
    name: d.device || 'Unknown',
    count: Number(d.count),
    bounceRate: Number(d.bounceRate),
  }))

  const totalVisitors = Number(totalVisitorsResult[0]?.count ?? 0)

  return {
    current: {
      visitors: currentVisitors,
      pageViews: currentPageViews,
      bounceRate: currentBounceRate,
      avgSessionDuration: currentAvgSessionDuration,
    },
    historical,
    topPages,
    deviceData,
    totalVisitors,
  }
}

export const aiRouter = router({
  insights: protectedProcedure
    .input(
      z.object({
        websiteId: z.string(),
        timeRange: z.string().default("30"),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id
      await ensureWebsiteAccess(ctx.db, input.websiteId, userId)

      const [snapshot, analyticsData] = await Promise.all([
        getAnalyticsSnapshot(ctx.db, input.websiteId, parseInt(input.timeRange)),
        getAnalyticsData(ctx.db, input.websiteId),
      ])
      const anomalies = detectAnomalies(analyticsData)
      const insights = await generateAIInsights(snapshot, anomalies)

      return insights
    }),

  anomalies: protectedProcedure
    .input(
      z.object({
        websiteId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id
      await ensureWebsiteAccess(ctx.db, input.websiteId, userId)

      const analyticsData = await getAnalyticsData(ctx.db, input.websiteId)
      const anomalies = detectAnomalies(analyticsData)

      return anomalies
    }),

  predictions: protectedProcedure
    .input(
      z.object({
        websiteId: z.string(),
        days: z.number().default(7),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id
      await ensureWebsiteAccess(ctx.db, input.websiteId, userId)

      const analyticsData = await getAnalyticsData(ctx.db, input.websiteId)
      const predictions = generatePredictions(analyticsData.historical, input.days)

      return predictions
    }),

  recommendations: protectedProcedure
    .input(
      z.object({
        websiteId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id
      await ensureWebsiteAccess(ctx.db, input.websiteId, userId)

      const analyticsData = await getAnalyticsData(ctx.db, input.websiteId)
      const recommendations = generateRecommendations(analyticsData)

      return recommendations
    }),
})

