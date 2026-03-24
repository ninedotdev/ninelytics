import { and, eq, sql } from "drizzle-orm"
import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { getGeoLocation } from "@/lib/geolocation"
import { isPathExcluded } from "@/lib/path-exclusions"
import { realtimeHelpers, isRedisConnected } from "@/lib/redis"
import { upsertSession, upsertVisitor } from "@/lib/tracking-helpers"
import { isBotRequest } from "@/lib/bot-detection"
import { isIpBlocked } from "@/lib/ip-filter"
import { normalizeUrl } from "@/lib/url-normalization"
import {
  conversions,
  events,
  goals,
  pageViews,
  performanceMetrics,
  visitorSessions,
  websites,
} from "@/server/db/schema"
import { publicProcedure, router } from "../trpc"

const baseTrackingFields = {
  trackingCode: z.string().min(1),
  visitorId: z.string().min(1),
  sessionId: z.string().min(1),
  page: z.string().optional(),
  referrer: z.string().optional(),
  landingPage: z.string().optional(),
  userAgent: z.string().optional(),
  browser: z.string().optional(),
  os: z.string().optional(),
  device: z.string().optional(),
  screenResolution: z.string().optional(),
  viewport: z.string().optional(),
  language: z.string().optional(),
  timezone: z.string().optional(),
  connection: z.string().optional(),
  pixelRatio: z.number().optional(),
  cookieEnabled: z.boolean().optional(),
  doNotTrack: z.boolean().optional(),
  utmSource: z.string().optional(),
  utmMedium: z.string().optional(),
  utmCampaign: z.string().optional(),
  utmTerm: z.string().optional(),
  utmContent: z.string().optional(),
  source: z.string().optional(),
  medium: z.string().optional(),
  referrerDomain: z.string().optional(),
  isSearchEngine: z.boolean().optional(),
  searchEngine: z.string().optional(),
  socialNetwork: z.string().optional(),
}

const sessionInput = z.object({
  ...baseTrackingFields,
  duration: z.number().optional(),
  pageViewCount: z.number().optional(),
  isBounce: z.boolean().optional(),
})

const pageviewInput = z.object({
  ...baseTrackingFields,
  page: z.string().min(1),
  title: z.string().optional(),
  timestamp: z.union([z.string(), z.number(), z.date()]).optional(),
})

const eventInput = z.object({
  ...baseTrackingFields,
  eventType: z.string().min(1),
  eventName: z.string().min(1),
  page: z.string().min(1),
  properties: z.record(z.string(), z.unknown()).optional(),
  timestamp: z.union([z.string(), z.number(), z.date()]).optional(),
})

const conversionInput = z.object({
  ...baseTrackingFields,
  page: z.string().optional(),
  eventName: z.string().optional(),
  duration: z.number().optional(),
  value: z.number().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

const parseDate = (value?: string | number | Date): string => {
  if (!value) return new Date().toISOString()
  const d = value instanceof Date ? value : new Date(value)
  return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString()
}

const assertAllowed = (headers: Headers) => {
  if (isBotRequest(headers.get("user-agent"))) {
    throw new TRPCError({ code: "NOT_FOUND" })
  }
  const ip = headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || headers.get("x-real-ip")
    || "unknown"
  if (isIpBlocked(ip)) {
    throw new TRPCError({ code: "NOT_FOUND" })
  }
}

export const trackingRouter = router({
  session: publicProcedure.input(sessionInput).mutation(async ({ input, ctx }) => {
    assertAllowed(ctx.headers)
    const { trackingCode, visitorId, sessionId } = input

    const website = await ctx.db
      .select({ id: websites.id, status: websites.status })
      .from(websites)
      .where(and(eq(websites.trackingCode, trackingCode), eq(websites.status, "ACTIVE")))
      .limit(1)

    if (website.length === 0) {
      throw new Error("Invalid tracking code")
    }

    const websiteId = website[0].id

    // Get IP address from headers
    const forwardedFor = ctx.headers.get('x-forwarded-for')
    const realIp = ctx.headers.get('x-real-ip')
    const ipAddress = forwardedFor?.split(',')[0]?.trim() || realIp || 'unknown'

    const geoData = await getGeoLocation(ipAddress, ctx.headers)

    await upsertVisitor(
      {
        websiteId,
        visitorId,
        ipAddress,
        userAgent: input.userAgent || ctx.headers.get('user-agent') || "unknown",
        browser: input.browser,
        os: input.os,
        device: input.device,
        screenResolution: input.screenResolution,
        viewport: input.viewport,
        language: input.language,
        timezone: input.timezone,
        connection: input.connection,
        pixelRatio: input.pixelRatio,
        cookieEnabled: input.cookieEnabled,
        doNotTrack: input.doNotTrack,
        country: geoData.country,
        state: geoData.regionName || geoData.region,
        city: geoData.city,
        lat: geoData.lat,
        lon: geoData.lon,
      },
      false,
      true
    )

    // Update session metrics if provided
    if (
      input.duration !== undefined ||
      input.isBounce !== undefined ||
      input.pageViewCount !== undefined
    ) {
      await ctx.db
        .update(visitorSessions)
        .set({
          duration: input.duration ?? visitorSessions.duration,
          pageViewCount:
            input.pageViewCount !== undefined
              ? input.pageViewCount
              : visitorSessions.pageViewCount,
          isBounce:
            input.isBounce !== undefined
              ? input.isBounce
              : input.pageViewCount === 1
              ? true
              : visitorSessions.isBounce,
          endTime: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
        .where(and(eq(visitorSessions.sessionId, sessionId), eq(visitorSessions.websiteId, websiteId)))

      return { success: true, updated: true }
    }

    const session = await upsertSession(
      {
        websiteId,
        visitorId,
        sessionId,
        referrer: input.referrer,
        landingPage: input.landingPage,
        utmSource: input.utmSource,
        utmMedium: input.utmMedium,
        utmCampaign: input.utmCampaign,
        utmTerm: input.utmTerm,
        utmContent: input.utmContent,
        source: input.source,
        medium: input.medium,
        referrerDomain: input.referrerDomain,
        isSearchEngine: input.isSearchEngine,
        searchEngine: input.searchEngine,
        socialNetwork: input.socialNetwork,
      },
      false
    )

    return { success: true, id: session?.id }
  }),

  pageview: publicProcedure.input(pageviewInput).mutation(async ({ input, ctx }) => {
    assertAllowed(ctx.headers)
    const website = await ctx.db
      .select({ id: websites.id, excludedPaths: websites.excludedPaths })
      .from(websites)
      .where(and(eq(websites.trackingCode, input.trackingCode), eq(websites.status, "ACTIVE")))
      .limit(1)

    if (website.length === 0) {
      throw new Error("Invalid tracking code")
    }
    const websiteId = website[0].id
    const excludedPaths = (website[0].excludedPaths as string[] | null) ?? []

    // Check if this path should be excluded
    if (isPathExcluded(input.page, excludedPaths)) {
      return { success: true, excluded: true }
    }

    // Normalize URLs for consistent tracking
    const page = normalizeUrl(input.page) || input.page
    const referrer = normalizeUrl(input.referrer) ?? input.referrer

    // Get IP address from headers
    const forwardedFor = ctx.headers.get('x-forwarded-for')
    const realIp = ctx.headers.get('x-real-ip')
    const ipAddress = forwardedFor?.split(',')[0]?.trim() || realIp || 'unknown'

    const geoData = await getGeoLocation(ipAddress, ctx.headers)

    await upsertVisitor(
      {
        websiteId,
        visitorId: input.visitorId,
        ipAddress,
        userAgent: input.userAgent || "unknown",
        browser: input.browser,
        os: input.os,
        device: input.device,
        screenResolution: input.screenResolution,
        viewport: input.viewport,
        language: input.language,
        timezone: input.timezone,
        connection: input.connection,
        pixelRatio: input.pixelRatio,
        cookieEnabled: input.cookieEnabled,
        doNotTrack: input.doNotTrack,
        country: geoData.country,
        state: geoData.regionName || geoData.region,
        city: geoData.city,
        lat: geoData.lat,
        lon: geoData.lon,
      },
      true,
      false
    )

    await upsertSession(
      {
        websiteId,
        visitorId: input.visitorId,
        sessionId: input.sessionId,
        referrer,
        landingPage: page,
        utmSource: input.utmSource,
        utmMedium: input.utmMedium,
        utmCampaign: input.utmCampaign,
        utmTerm: input.utmTerm,
        utmContent: input.utmContent,
        source: input.source,
        medium: input.medium,
        referrerDomain: input.referrerDomain,
        isSearchEngine: input.isSearchEngine,
        searchEngine: input.searchEngine,
        socialNetwork: input.socialNetwork,
      },
      true
    )

    const [pageView] = await ctx.db
      .insert(pageViews)
      .values({
        websiteId,
        visitorId: input.visitorId,
        sessionId: input.sessionId,
        page,
        title: input.title,
        referrer,
        timestamp: parseDate(input.timestamp),
      })
      .returning({ id: pageViews.id })

    if (isRedisConnected) {
      realtimeHelpers
        .markVisitorActive(websiteId, input.visitorId, {
          page,
          country: geoData.country ?? undefined,
          city: geoData.city ?? undefined,
          device: input.device,
          browser: input.browser,
        })
        .catch((err) => console.error("Redis error:", err))

      realtimeHelpers
        .addLiveEvent(websiteId, {
          type: "pageview",
          name: "Page View",
          page,
          visitorId: input.visitorId,
          timestamp: Date.now(),
        })
        .catch((err) => console.error("Redis error:", err))
    }

    return { success: true, id: pageView?.id }
  }),

  event: publicProcedure.input(eventInput).mutation(async ({ input, ctx }) => {
    assertAllowed(ctx.headers)
    const website = await ctx.db
      .select({ id: websites.id })
      .from(websites)
      .where(and(eq(websites.trackingCode, input.trackingCode), eq(websites.status, "ACTIVE")))
      .limit(1)

    if (website.length === 0) {
      throw new Error("Invalid tracking code")
    }
    const websiteId = website[0].id

    // Get IP address from headers
    const forwardedFor = ctx.headers.get('x-forwarded-for')
    const realIp = ctx.headers.get('x-real-ip')
    const ipAddress = forwardedFor?.split(',')[0]?.trim() || realIp || 'unknown'
    const geoData = await getGeoLocation(ipAddress, ctx.headers)

    await upsertVisitor(
      {
        websiteId,
        visitorId: input.visitorId,
        ipAddress,
        userAgent: input.userAgent || ctx.headers.get('user-agent') || "unknown",
        browser: input.browser,
        os: input.os,
        device: input.device,
        screenResolution: input.screenResolution,
        viewport: input.viewport,
        language: input.language,
        timezone: input.timezone,
        connection: input.connection,
        pixelRatio: input.pixelRatio,
        cookieEnabled: input.cookieEnabled,
        doNotTrack: input.doNotTrack,
        country: geoData.country,
        state: geoData.regionName || geoData.region,
        city: geoData.city,
        lat: geoData.lat,
        lon: geoData.lon,
      },
      false,
      false
    )

    await upsertSession(
      {
        websiteId,
        visitorId: input.visitorId,
        sessionId: input.sessionId,
        referrer: input.referrer,
        landingPage: input.landingPage || input.page,
        utmSource: input.utmSource,
        utmMedium: input.utmMedium,
        utmCampaign: input.utmCampaign,
        utmTerm: input.utmTerm,
        utmContent: input.utmContent,
        source: input.source,
        medium: input.medium,
        referrerDomain: input.referrerDomain,
        isSearchEngine: input.isSearchEngine,
        searchEngine: input.searchEngine,
        socialNetwork: input.socialNetwork,
      },
      false
    )

    if (input.eventType === "performance" && input.properties) {
      const props = input.properties as Record<string, unknown>
      await ctx.db.insert(performanceMetrics).values({
        websiteId,
        sessionId: input.sessionId,
        page: (props.page as string) || input.page,
        loadTime: Number(props.loadTime) || 0,
        domContentLoaded: Number(props.domContentLoaded) || 0,
        timeToInteractive: Number(props.timeToInteractive) || 0,
        firstPaint: props.firstPaint ? Number(props.firstPaint) : null,
        firstContentfulPaint: props.firstContentfulPaint ? Number(props.firstContentfulPaint) : null,
        navigationType: Number(props.navigationType) || 0,
        timestamp: parseDate(input.timestamp),
      })
    }

    const [event] = await ctx.db
      .insert(events)
      .values({
        websiteId,
        visitorId: input.visitorId,
        sessionId: input.sessionId,
        eventType: input.eventType,
        eventName: input.eventName,
        page: input.page,
        properties: input.properties || {},
        timestamp: parseDate(input.timestamp),
      })
      .returning({ id: events.id })

    if (isRedisConnected) {
      realtimeHelpers
        .addLiveEvent(websiteId, {
          type: input.eventType,
          name: input.eventName,
          page: input.page,
          visitorId: input.visitorId,
          timestamp: Date.now(),
          properties: input.properties || {},
        })
        .catch((err) => console.error("Redis error:", err))
    }

    return { success: true, id: event?.id }
  }),

  conversion: publicProcedure.input(conversionInput).mutation(async ({ input, ctx }) => {
    assertAllowed(ctx.headers)
    const website = await ctx.db
      .select({
        id: websites.id,
      })
      .from(websites)
      .where(and(eq(websites.trackingCode, input.trackingCode), eq(websites.status, "ACTIVE")))
      .limit(1)

    if (website.length === 0) {
      throw new Error("Website not found")
    }
    const websiteId = website[0].id

    const goalsRows = await ctx.db
      .select()
      .from(goals)
      .where(and(eq(goals.websiteId, websiteId), eq(goals.isActive, true)))

    // Filter to goals that match current input
    const matchedGoals = goalsRows.filter((goal) => {
      switch (goal.type) {
        case "PAGEVIEW":
          return !!input.page && input.page === goal.targetValue
        case "EVENT":
          return !!input.eventName && input.eventName === goal.targetValue
        case "DURATION": {
          const targetDuration = parseInt(goal.targetValue, 10)
          return !isNaN(targetDuration) && !!input.duration && input.duration >= targetDuration
        }
        default:
          return false
      }
    })

    if (matchedGoals.length === 0) {
      return { success: true, conversions: [] }
    }

    // Batch check existing conversions for all matched goals at once
    const matchedGoalIds = matchedGoals.map((g) => g.id)
    const existingConversions = await ctx.db
      .select({ goalId: conversions.goalId, sessionId: conversions.sessionId, visitorId: conversions.visitorId })
      .from(conversions)
      .where(and(
        sql`${conversions.goalId} IN (${sql.join(matchedGoalIds.map(id => sql`${id}`), sql`, `)})`,
        sql`(${conversions.sessionId} = ${input.sessionId} OR ${conversions.visitorId} = ${input.visitorId})`
      ))

    const existingByGoalSession = new Set(existingConversions.map((c) => `${c.goalId}:session:${c.sessionId}`))
    const existingByGoalVisitor = new Set(existingConversions.map((c) => `${c.goalId}:visitor:${c.visitorId}`))

    const created: Array<{ goalId: string; conversionId: string }> = []

    for (const goal of matchedGoals) {
      let shouldConvert = false

      switch (goal.targetUnit) {
        case "PER_SESSION": {
          const alreadyConverted = existingByGoalSession.has(`${goal.id}:session:${input.sessionId}`)
          if (!alreadyConverted) {
            // Only count occurrences if not already converted (single query per goal)
            let occurrenceCount = 0
            if (goal.type === "PAGEVIEW") {
              const rows = await ctx.db.select({ count: sql<number>`count(*)` }).from(pageViews).where(and(eq(pageViews.sessionId, input.sessionId), eq(pageViews.page, goal.targetValue)))
              occurrenceCount = Number(rows[0]?.count ?? 0)
            } else if (goal.type === "EVENT") {
              const rows = await ctx.db.select({ count: sql<number>`count(*)` }).from(events).where(and(eq(events.sessionId, input.sessionId), eq(events.eventName, goal.targetValue)))
              occurrenceCount = Number(rows[0]?.count ?? 0)
            } else if (goal.type === "DURATION") {
              occurrenceCount = 1
            }
            shouldConvert = occurrenceCount >= goal.threshold
          }
          break
        }
        case "PER_VISITOR": {
          const alreadyConverted = existingByGoalVisitor.has(`${goal.id}:visitor:${input.visitorId}`)
          if (!alreadyConverted) {
            let occurrenceCount = 0
            if (goal.type === "PAGEVIEW") {
              const rows = await ctx.db.select({ count: sql<number>`count(*)` }).from(pageViews).where(and(eq(pageViews.visitorId, input.visitorId), eq(pageViews.page, goal.targetValue)))
              occurrenceCount = Number(rows[0]?.count ?? 0)
            } else if (goal.type === "EVENT") {
              const rows = await ctx.db.select({ count: sql<number>`count(*)` }).from(events).where(and(eq(events.visitorId, input.visitorId), eq(events.eventName, goal.targetValue)))
              occurrenceCount = Number(rows[0]?.count ?? 0)
            } else if (goal.type === "DURATION") {
              const rows = await ctx.db.select({ count: sql<number>`count(*)` }).from(visitorSessions).where(and(eq(visitorSessions.visitorId, input.visitorId), sql`${visitorSessions.duration} >= ${parseInt(goal.targetValue, 10)}`))
              occurrenceCount = Number(rows[0]?.count ?? 0)
            }
            shouldConvert = occurrenceCount >= goal.threshold
          }
          break
        }
        case "TOTAL": {
          const alreadyConverted = existingByGoalSession.has(`${goal.id}:session:${input.sessionId}`)
          if (!alreadyConverted) {
            let occurrenceCount = 0
            if (goal.type === "PAGEVIEW") {
              const rows = await ctx.db.select({ count: sql<number>`count(*)` }).from(pageViews).where(and(eq(pageViews.websiteId, websiteId), eq(pageViews.page, goal.targetValue)))
              occurrenceCount = Number(rows[0]?.count ?? 0)
            } else if (goal.type === "EVENT") {
              const rows = await ctx.db.select({ count: sql<number>`count(*)` }).from(events).where(and(eq(events.websiteId, websiteId), eq(events.eventName, goal.targetValue)))
              occurrenceCount = Number(rows[0]?.count ?? 0)
            } else if (goal.type === "DURATION") {
              const rows = await ctx.db.select({ count: sql<number>`count(*)` }).from(visitorSessions).where(and(eq(visitorSessions.websiteId, websiteId), sql`${visitorSessions.duration} >= ${parseInt(goal.targetValue, 10)}`))
              occurrenceCount = Number(rows[0]?.count ?? 0)
            }
            shouldConvert = occurrenceCount >= goal.threshold
          }
          break
        }
      }

      if (!shouldConvert) continue

      const [conv] = await ctx.db
        .insert(conversions)
        .values({
          goalId: goal.id,
          websiteId,
          visitorId: input.visitorId,
          sessionId: input.sessionId,
          value: input.value ? String(input.value) : null,
          metadata: input.metadata,
          timestamp: new Date().toISOString(),
        })
        .returning({ id: conversions.id, goalId: conversions.goalId })

      if (conv) created.push({ goalId: conv.goalId, conversionId: conv.id })
    }

    return { success: true, conversions: created }
  }),
})

