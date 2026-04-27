/**
 * /api/public/share/:token — read-only stats for a website, accessible
 * without auth via a share token. The token grants access; revoking it
 * (DELETE in tRPC `shareLinks.revoke`) immediately disables the URL.
 *
 * Mirrors a subset of `websites.stats` (the bits a public viewer cares
 * about: KPIs, ring breakdowns, referrers, daily chart) and deliberately
 * does NOT expose visitor IPs, individual session detail, or any PII.
 *
 * Cached in Redis (60s) to absorb re-shares / refreshes without re-running
 * 8 aggregate queries on every request.
 */
import { Hono } from 'hono'
import { and, desc, eq, isNotNull, sql } from 'drizzle-orm'
import { db } from '@ninelytics/shared/db'
import {
  websiteShareLinks,
  websites,
  pageViews,
  visitors,
  visitorSessions,
} from '@ninelytics/db/schema'
import { tzDate, safeTimezone } from '@ninelytics/shared/timezone'
import { withQueryCache } from '@ninelytics/shared/query-cache'

export const publicShare = new Hono()

publicShare.options('/:token', (c) => c.body(null, 200))

publicShare.get('/:token', async (c) => {
  const token = c.req.param('token')
  if (!token || token.length < 16) return c.json({ error: 'Invalid token' }, 404)

  const [link] = await db
    .select({
      id: websiteShareLinks.id,
      websiteId: websiteShareLinks.websiteId,
      expiresAt: websiteShareLinks.expiresAt,
      label: websiteShareLinks.label,
    })
    .from(websiteShareLinks)
    .where(eq(websiteShareLinks.token, token))
    .limit(1)
  if (!link) return c.json({ error: 'Not found' }, 404)
  if (link.expiresAt && new Date(link.expiresAt).getTime() < Date.now()) {
    return c.json({ error: 'Link expired' }, 410)
  }

  const [website] = await db
    .select({
      id: websites.id,
      name: websites.name,
      url: websites.url,
      createdAt: websites.createdAt,
    })
    .from(websites)
    .where(and(eq(websites.id, link.websiteId), eq(websites.status, 'ACTIVE')))
    .limit(1)
  if (!website) return c.json({ error: 'Website not available' }, 404)

  const tz = safeTimezone(c.req.query('tz'))
  const period = (c.req.query('period') ?? '30d') as '1d' | '7d' | '30d' | '90d'
  const periodDays = period === '1d' ? 1 : period === '7d' ? 7 : period === '30d' ? 30 : 90
  const periodStartIso = new Date(Date.now() - periodDays * 24 * 60 * 60 * 1000).toISOString()

  // Count counter fire-and-forget (outside the cache so refreshes still
  // bump the counter even when the response itself is served from cache).
  void db
    .update(websiteShareLinks)
    .set({
      lastViewedAt: new Date().toISOString(),
      viewCount: sql`${websiteShareLinks.viewCount} + 1`,
    })
    .where(eq(websiteShareLinks.id, link.id))
    .catch(() => undefined)

  const cacheKey = `share:${link.id}:${period}:${tz}`
  const payload = await withQueryCache(cacheKey, 60, async () => {
    const [
      totals,
      sessionAgg,
      topPagesData,
      topCountriesData,
      deviceData,
      browserData,
      osData,
      topReferrersData,
      trafficSourcesData,
      chartRaw,
    ] = await Promise.all([
      db
        .select({
          pageViews: sql<number>`count(*)`,
          visitors: sql<number>`count(DISTINCT ${pageViews.visitorId})`,
          sessions: sql<number>`count(DISTINCT ${pageViews.sessionId})`,
        })
        .from(pageViews)
        .where(
          and(
            eq(pageViews.websiteId, website.id),
            sql`${pageViews.timestamp} >= ${periodStartIso}`,
          ),
        ),
      db
        .select({
          totalSessions: sql<number>`count(*)`,
          bouncedSessions: sql<number>`count(*) FILTER (WHERE ${visitorSessions.isBounce} = true)`,
          avgDuration: sql<number>`coalesce(avg(${visitorSessions.duration}) FILTER (WHERE ${visitorSessions.duration} IS NOT NULL AND ${visitorSessions.duration} > 0), 0)`,
        })
        .from(visitorSessions)
        .where(
          and(
            eq(visitorSessions.websiteId, website.id),
            sql`${visitorSessions.startTime} >= ${periodStartIso}`,
          ),
        ),
      db
        .select({
          page: pageViews.page,
          count: sql<number>`count(*)`,
        })
        .from(pageViews)
        .where(
          and(
            eq(pageViews.websiteId, website.id),
            sql`${pageViews.timestamp} >= ${periodStartIso}`,
          ),
        )
        .groupBy(pageViews.page)
        .orderBy(desc(sql`count(*)`))
        .limit(10),
      db
        .select({
          country: visitors.country,
          count: sql<number>`count(DISTINCT ${visitors.visitorId})`,
        })
        .from(visitors)
        .where(
          and(
            eq(visitors.websiteId, website.id),
            isNotNull(visitors.country),
            sql`${visitors.lastVisit} >= ${periodStartIso}`,
          ),
        )
        .groupBy(visitors.country)
        .orderBy(desc(sql`count(DISTINCT ${visitors.visitorId})`))
        .limit(10),
      db
        .select({
          device: visitors.device,
          count: sql<number>`count(DISTINCT ${visitors.visitorId})`,
        })
        .from(visitors)
        .where(
          and(
            eq(visitors.websiteId, website.id),
            isNotNull(visitors.device),
            sql`${visitors.lastVisit} >= ${periodStartIso}`,
          ),
        )
        .groupBy(visitors.device)
        .orderBy(desc(sql`count(DISTINCT ${visitors.visitorId})`)),
      db
        .select({
          browser: visitors.browser,
          count: sql<number>`count(DISTINCT ${visitors.visitorId})`,
        })
        .from(visitors)
        .where(
          and(
            eq(visitors.websiteId, website.id),
            isNotNull(visitors.browser),
            sql`${visitors.lastVisit} >= ${periodStartIso}`,
          ),
        )
        .groupBy(visitors.browser)
        .orderBy(desc(sql`count(DISTINCT ${visitors.visitorId})`))
        .limit(10),
      db
        .select({
          os: visitors.os,
          count: sql<number>`count(DISTINCT ${visitors.visitorId})`,
        })
        .from(visitors)
        .where(
          and(
            eq(visitors.websiteId, website.id),
            isNotNull(visitors.os),
            sql`${visitors.lastVisit} >= ${periodStartIso}`,
          ),
        )
        .groupBy(visitors.os)
        .orderBy(desc(sql`count(DISTINCT ${visitors.visitorId})`))
        .limit(10),
      db
        .select({
          referrer: sql<string>`coalesce(${visitorSessions.referrerDomain}, ${visitorSessions.referrer}, 'direct')`,
          count: sql<number>`count(*)`,
        })
        .from(visitorSessions)
        .where(
          and(
            eq(visitorSessions.websiteId, website.id),
            sql`${visitorSessions.startTime} >= ${periodStartIso}`,
          ),
        )
        .groupBy(sql`coalesce(${visitorSessions.referrerDomain}, ${visitorSessions.referrer}, 'direct')`)
        .orderBy(desc(sql`count(*)`))
        .limit(8),
      db
        .select({
          source: sql<string>`coalesce(${visitorSessions.utmSource}, ${visitorSessions.source}, 'direct')`,
          count: sql<number>`count(*)`,
        })
        .from(visitorSessions)
        .where(
          and(
            eq(visitorSessions.websiteId, website.id),
            sql`${visitorSessions.startTime} >= ${periodStartIso}`,
          ),
        )
        .groupBy(sql`coalesce(${visitorSessions.utmSource}, ${visitorSessions.source}, 'direct')`)
        .orderBy(desc(sql`count(*)`))
        .limit(8),
      db
        .select({
          day: sql<string>`${sql.raw(tzDate('"page_views"."timestamp"', tz))}::text`,
          views: sql<number>`count(*)`,
          visitors: sql<number>`count(DISTINCT ${pageViews.visitorId})`,
        })
        .from(pageViews)
        .where(
          and(
            eq(pageViews.websiteId, website.id),
            sql`${pageViews.timestamp} >= ${periodStartIso}`,
          ),
        )
        .groupBy(sql.raw(tzDate('"page_views"."timestamp"', tz)))
        .orderBy(sql.raw(tzDate('"page_views"."timestamp"', tz))),
    ])

    const t = totals[0] ?? { pageViews: 0, visitors: 0, sessions: 0 }
    const s = sessionAgg[0] ?? { totalSessions: 0, bouncedSessions: 0, avgDuration: 0 }
    const totalSessions = Number(s.totalSessions ?? 0)
    const bounceRate = totalSessions > 0
      ? Math.round((Number(s.bouncedSessions ?? 0) / totalSessions) * 1000) / 10
      : 0

    return {
      website: { name: website.name, url: website.url, createdAt: website.createdAt },
      label: link.label,
      period,
      timezone: tz,
      totals: {
        pageViews: Number(t.pageViews ?? 0),
        visitors: Number(t.visitors ?? 0),
        sessions: Number(t.sessions ?? 0),
        bounceRate,
        avgSessionDuration: Math.round(Number(s.avgDuration ?? 0)),
      },
      topPages: topPagesData.map((p) => ({ page: p.page, count: Number(p.count) })),
      topCountries: topCountriesData.map((c) => ({
        country: c.country ?? 'Unknown',
        count: Number(c.count),
      })),
      devices: deviceData.map((d) => ({ device: d.device ?? 'Unknown', count: Number(d.count) })),
      browsers: browserData.map((b) => ({ browser: b.browser ?? 'Unknown', count: Number(b.count) })),
      os: osData.map((o) => ({ os: o.os ?? 'Unknown', count: Number(o.count) })),
      topReferrers: topReferrersData.map((r) => ({
        referrer: r.referrer ?? 'direct',
        count: Number(r.count),
      })),
      trafficSources: trafficSourcesData.map((s) => ({
        source: s.source ?? 'direct',
        count: Number(s.count),
      })),
      chart: chartRaw.map((r) => ({ day: r.day, views: Number(r.views), visitors: Number(r.visitors) })),
    }
  })

  return c.json(payload)
})
