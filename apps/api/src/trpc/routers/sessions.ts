/**
 * Sessions router. Provides per-website session listing and per-session
 * activity timeline. Reuses existing tables (visitor_sessions, visitors,
 * page_views, events) — no schema change.
 *
 */
import { z } from "zod"
import { sql } from "drizzle-orm"
import { router, protectedProcedure } from "../trpc"
import {
  websites,
  userWebsiteAccess,
} from "@ninelytics/db/schema"
import { eq, and, or } from "drizzle-orm"

// Centralized auth check — caller must own or have access to the website.
async function assertWebsiteAccess(
  db: typeof import("@ninelytics/shared/db").db,
  userId: string,
  websiteId: string,
): Promise<void> {
  const [row] = await db
    .select({ id: websites.id })
    .from(websites)
    .leftJoin(userWebsiteAccess, eq(userWebsiteAccess.websiteId, websites.id))
    .where(
      and(
        eq(websites.id, websiteId),
        or(eq(websites.ownerId, userId), eq(userWebsiteAccess.userId, userId)),
      ),
    )
    .limit(1)
  if (!row) throw new Error("Website not found or access denied")
}

async function getUserWebsiteIds(
  db: typeof import("@ninelytics/shared/db").db,
  userId: string,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ id: websites.id })
    .from(websites)
    .leftJoin(userWebsiteAccess, eq(userWebsiteAccess.websiteId, websites.id))
    .where(
      sql`${websites.ownerId} = ${userId} OR ${userWebsiteAccess.userId} = ${userId}`,
    )
  return rows.map((r) => r.id)
}

const listInput = z.object({
  websiteId: z.string().nullish(),
  startDate: z.string().nullish(),
  endDate: z.string().nullish(),
  search: z.string().nullish(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
})

type SessionListRow = {
  [key: string]: unknown
  session_id: string
  visitor_id: string
  website_id: string
  website_name: string
  start_time: string
  last_activity: string
  views: number
  events: number
  duration: number | null
  is_bounce: boolean
  landing_page: string | null
  exit_page: string | null
  referrer_domain: string | null
  source: string | null
  country: string | null
  city: string | null
  browser: string | null
  os: string | null
  device: string | null
  language: string | null
}

export const sessionsRouter = router({
  list: protectedProcedure.input(listInput).query(async ({ ctx, input }) => {
    const userId = ctx.session!.user.id
    const allWebsiteIds = await getUserWebsiteIds(ctx.db, userId)
    if (allWebsiteIds.length === 0) {
      return { items: [], total: 0, page: input.page, pageSize: input.pageSize }
    }

    const targetIds = input.websiteId
      ? allWebsiteIds.includes(input.websiteId)
        ? [input.websiteId]
        : []
      : allWebsiteIds

    if (targetIds.length === 0) {
      return { items: [], total: 0, page: input.page, pageSize: input.pageSize }
    }

    const end = input.endDate ? new Date(input.endDate) : new Date()
    const start = input.startDate
      ? new Date(input.startDate)
      : new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000)

    const offset = (input.page - 1) * input.pageSize
    const idsClause = sql.join(
      targetIds.map((id) => sql`${id}`),
      sql`, `,
    )
    const search = input.search?.trim()
    const searchClause = search
      ? sql`AND (
            v.country ILIKE ${"%" + search + "%"} OR
            v.city ILIKE ${"%" + search + "%"} OR
            v.browser ILIKE ${"%" + search + "%"} OR
            v.os ILIKE ${"%" + search + "%"} OR
            v.device ILIKE ${"%" + search + "%"} OR
            vs.session_id ILIKE ${"%" + search + "%"} OR
            vs.visitor_id ILIKE ${"%" + search + "%"}
          )`
      : sql``

    // Total count (filtered)
    const totalRes = await ctx.db.execute<{ total: number }>(sql`
      SELECT COUNT(*)::int AS total
      FROM visitor_sessions vs
      LEFT JOIN visitors v ON v.website_id = vs.website_id AND v.visitor_id = vs.visitor_id
      WHERE vs.website_id IN (${idsClause})
        AND vs.start_time >= ${start.toISOString()}
        AND vs.start_time <= ${end.toISOString()}
        ${searchClause}
    `)
    const total = Number((totalRes as unknown as Array<{ total: number }>)[0]?.total ?? 0)

    // Page rows. We compute view/event counts from the relevant tables so
    // the numbers match the activity timeline exactly.
    const rows = await ctx.db.execute<SessionListRow>(sql`
      SELECT
        vs.session_id,
        vs.visitor_id,
        vs.website_id,
        w.name AS website_name,
        vs.start_time,
        GREATEST(vs.start_time, COALESCE(vs.end_time, vs.updated_at)) AS last_activity,
        COALESCE((
          SELECT COUNT(*)::int FROM page_views pv
          WHERE pv.website_id = vs.website_id
            AND pv.session_id = vs.session_id
        ), 0) AS views,
        COALESCE((
          SELECT COUNT(*)::int FROM events e
          WHERE e.website_id = vs.website_id
            AND e.session_id = vs.session_id
        ), 0) AS events,
        vs.duration,
        vs.is_bounce,
        vs.landing_page,
        vs.exit_page,
        vs.referrer_domain,
        vs.source,
        v.country, v.city, v.browser, v.os, v.device, v.language
      FROM visitor_sessions vs
      LEFT JOIN visitors v ON v.website_id = vs.website_id AND v.visitor_id = vs.visitor_id
      LEFT JOIN websites w ON w.id = vs.website_id
      WHERE vs.website_id IN (${idsClause})
        AND vs.start_time >= ${start.toISOString()}
        AND vs.start_time <= ${end.toISOString()}
        ${searchClause}
      ORDER BY vs.start_time DESC
      LIMIT ${input.pageSize} OFFSET ${offset}
    `)

    const rowsArr = rows as unknown as SessionListRow[]
    const items = rowsArr.map((r) => ({
      sessionId: r.session_id,
      visitorId: r.visitor_id,
      websiteId: r.website_id,
      websiteName: r.website_name,
      startTime: r.start_time,
      lastActivity: r.last_activity,
      views: Number(r.views ?? 0),
      events: Number(r.events ?? 0),
      duration: r.duration ?? 0,
      isBounce: !!r.is_bounce,
      landingPage: r.landing_page,
      exitPage: r.exit_page,
      referrerDomain: r.referrer_domain,
      source: r.source,
      country: r.country,
      city: r.city,
      browser: r.browser,
      os: r.os,
      device: r.device,
      language: r.language,
    }))

    return { items, total, page: input.page, pageSize: input.pageSize }
  }),

  byId: protectedProcedure
    .input(z.object({ websiteId: z.string(), sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id
      await assertWebsiteAccess(ctx.db, userId, input.websiteId)

      const rows = await ctx.db.execute<SessionListRow>(sql`
        SELECT
          vs.session_id, vs.visitor_id, vs.website_id, w.name AS website_name,
          vs.start_time,
          GREATEST(vs.start_time, COALESCE(vs.end_time, vs.updated_at)) AS last_activity,
          COALESCE((
            SELECT COUNT(*)::int FROM page_views pv
            WHERE pv.website_id = vs.website_id AND pv.session_id = vs.session_id
          ), 0) AS views,
          COALESCE((
            SELECT COUNT(*)::int FROM events e
            WHERE e.website_id = vs.website_id AND e.session_id = vs.session_id
          ), 0) AS events,
          vs.duration, vs.is_bounce, vs.landing_page, vs.exit_page,
          vs.referrer_domain, vs.source,
          v.country, v.city, v.browser, v.os, v.device, v.language
        FROM visitor_sessions vs
        LEFT JOIN visitors v ON v.website_id = vs.website_id AND v.visitor_id = vs.visitor_id
        LEFT JOIN websites w ON w.id = vs.website_id
        WHERE vs.website_id = ${input.websiteId}
          AND vs.session_id = ${input.sessionId}
        LIMIT 1
      `)
      const r = (rows as unknown as SessionListRow[])[0]
      if (!r) throw new Error("Session not found")

      return {
        sessionId: r.session_id,
        visitorId: r.visitor_id,
        websiteId: r.website_id,
        websiteName: r.website_name,
        startTime: r.start_time,
        lastActivity: r.last_activity,
        views: Number(r.views ?? 0),
        events: Number(r.events ?? 0),
        duration: r.duration ?? 0,
        isBounce: !!r.is_bounce,
        landingPage: r.landing_page,
        exitPage: r.exit_page,
        referrerDomain: r.referrer_domain,
        source: r.source,
        country: r.country,
        city: r.city,
        browser: r.browser,
        os: r.os,
        device: r.device,
        language: r.language,
      }
    }),

  activity: protectedProcedure
    .input(
      z.object({
        websiteId: z.string(),
        sessionId: z.string(),
        limit: z.number().int().min(1).max(2000).default(500),
      }),
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id
      await assertWebsiteAccess(ctx.db, userId, input.websiteId)

      // UNION ALL of pageviews + events with a discriminator column,
      // ordered chronologically.
      const rows = await ctx.db.execute<{
        kind: "pageview" | "event"
        ts: string
        page: string
        title: string | null
        referrer: string | null
        event_type: string | null
        event_name: string | null
        properties: Record<string, unknown> | null
      }>(sql`
        (
          SELECT 'pageview'::text AS kind,
                 pv.timestamp AS ts,
                 pv.page AS page,
                 pv.title AS title,
                 pv.referrer AS referrer,
                 NULL::text AS event_type,
                 NULL::text AS event_name,
                 NULL::jsonb AS properties
          FROM page_views pv
          WHERE pv.website_id = ${input.websiteId}
            AND pv.session_id = ${input.sessionId}
        )
        UNION ALL
        (
          SELECT 'event'::text AS kind,
                 e.timestamp AS ts,
                 e.page AS page,
                 NULL::text AS title,
                 NULL::text AS referrer,
                 e.event_type AS event_type,
                 e.event_name AS event_name,
                 e.properties AS properties
          FROM events e
          WHERE e.website_id = ${input.websiteId}
            AND e.session_id = ${input.sessionId}
        )
        ORDER BY ts ASC
        LIMIT ${input.limit}
      `)

      return (rows as unknown as Array<{
        kind: "pageview" | "event"
        ts: string
        page: string
        title: string | null
        referrer: string | null
        event_type: string | null
        event_name: string | null
        properties: Record<string, unknown> | null
      }>).map((r) => ({
        kind: r.kind,
        timestamp: r.ts,
        page: r.page,
        title: r.title,
        referrer: r.referrer,
        eventType: r.event_type,
        eventName: r.event_name,
        properties: r.properties,
      }))
    }),
})
