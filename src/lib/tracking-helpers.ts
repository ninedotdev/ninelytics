import { sql, and, eq } from "drizzle-orm"
import { db } from "@/server/db/client"
import { visitors, visitorSessions } from "@/server/db/schema"
import type { InferInsertModel } from "drizzle-orm"

interface VisitorData {
  websiteId: string
  visitorId: string
  ipAddress: string
  userAgent: string
  browser?: string
  os?: string
  device?: string
  screenResolution?: string
  viewport?: string
  language?: string
  timezone?: string
  connection?: string
  pixelRatio?: number
  cookieEnabled?: boolean
  doNotTrack?: boolean
  country?: string | null
  state?: string | null
  city?: string | null
  lat?: number | null
  lon?: number | null
}

interface SessionData {
  websiteId: string
  visitorId: string
  sessionId: string
  referrer?: string
  landingPage?: string
  exitPage?: string
  utmSource?: string
  utmMedium?: string
  utmCampaign?: string
  utmTerm?: string
  utmContent?: string
  source?: string
  medium?: string
  referrerDomain?: string
  isSearchEngine?: boolean
  searchEngine?: string
  socialNetwork?: string
}

const toIso = (d: Date) => d.toISOString()

export async function upsertVisitor(
  data: VisitorData,
  incrementPageViews = false,
  incrementSessions = false
) {
  const nowIso = toIso(new Date())

  const updateSet: Record<string, unknown> = {
    lastVisit: nowIso,
    ipAddress: data.ipAddress,
    userAgent: data.userAgent,
    browser: data.browser,
    os: data.os,
    device: data.device,
    screenResolution: data.screenResolution,
    viewport: data.viewport,
    language: data.language,
    timezone: data.timezone,
    connection: data.connection,
    pixelRatio: data.pixelRatio != null ? String(data.pixelRatio) : null,
    cookieEnabled: data.cookieEnabled ?? null,
    doNotTrack: data.doNotTrack ?? null,
    // Only overwrite geo fields when we have a real value — never wipe with null
    ...(data.country != null && { country: data.country }),
    ...(data.state != null && { state: data.state }),
    ...(data.city != null && { city: data.city }),
    ...(data.lat != null && { lat: String(data.lat) }),
    ...(data.lon != null && { lon: String(data.lon) }),
    updatedAt: nowIso,
  }

  if (incrementPageViews) {
    updateSet.totalPageViews = sql`${visitors.totalPageViews} + 1`
  }
  if (incrementSessions) {
    updateSet.totalSessions = sql`${visitors.totalSessions} + 1`
  }

  try {
    const [result] = await db
      .insert(visitors)
      .values({
        websiteId: data.websiteId,
        visitorId: data.visitorId,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        browser: data.browser,
        os: data.os,
        device: data.device,
        screenResolution: data.screenResolution,
        viewport: data.viewport,
        language: data.language,
        timezone: data.timezone,
        connection: data.connection,
        pixelRatio: data.pixelRatio != null ? String(data.pixelRatio) : null,
        cookieEnabled: data.cookieEnabled ?? null,
        doNotTrack: data.doNotTrack ?? null,
        country: data.country ?? null,
        state: data.state ?? null,
        city: data.city ?? null,
        lat: data.lat != null ? String(data.lat) : null,
        lon: data.lon != null ? String(data.lon) : null,
        totalPageViews: incrementPageViews ? 1 : 0,
        totalSessions: incrementSessions ? 1 : 0,
        firstVisit: nowIso,
        lastVisit: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
      } satisfies InferInsertModel<typeof visitors>)
      .onConflictDoUpdate({
        target: [visitors.websiteId, visitors.visitorId],
        set: updateSet as Partial<InferInsertModel<typeof visitors>>,
      })
      .returning()

    return result
  } catch (e: unknown) {
    // FK violation = website was deleted between check and insert — ignore
    if (e instanceof Error && e.message.includes("foreign key constraint")) return null
    throw e
  }
}

export async function upsertSession(
  data: SessionData,
  incrementPageViews = false
) {
  const nowIso = toIso(new Date())

  const updateSet: Record<string, unknown> = {
    endTime: nowIso,
    updatedAt: nowIso,
    // Only overwrite source/UTM/referrer fields when we have a real value —
    // never wipe with null (pageview route calls upsertSession without these fields)
    ...(data.referrer != null && { referrer: data.referrer }),
    ...(data.landingPage != null && { landingPage: data.landingPage }),
    ...(data.exitPage != null && { exitPage: data.exitPage }),
    ...(data.utmSource != null && { utmSource: data.utmSource }),
    ...(data.utmMedium != null && { utmMedium: data.utmMedium }),
    ...(data.utmCampaign != null && { utmCampaign: data.utmCampaign }),
    ...(data.utmTerm != null && { utmTerm: data.utmTerm }),
    ...(data.utmContent != null && { utmContent: data.utmContent }),
    ...(data.source != null && { source: data.source }),
    ...(data.medium != null && { medium: data.medium }),
    ...(data.referrerDomain != null && { referrerDomain: data.referrerDomain }),
    ...(data.isSearchEngine != null && { isSearchEngine: data.isSearchEngine }),
    ...(data.searchEngine != null && { searchEngine: data.searchEngine }),
    ...(data.socialNetwork != null && { socialNetwork: data.socialNetwork }),
  }

  if (incrementPageViews) {
    updateSet.pageViewCount = sql`${visitorSessions.pageViewCount} + 1`
  }

  try {
    const [result] = await db
      .insert(visitorSessions)
      .values({
        websiteId: data.websiteId,
        visitorId: data.visitorId,
        sessionId: data.sessionId,
        referrer: data.referrer ?? null,
        landingPage: data.landingPage ?? null,
        utmSource: data.utmSource ?? null,
        utmMedium: data.utmMedium ?? null,
        utmCampaign: data.utmCampaign ?? null,
        utmTerm: data.utmTerm ?? null,
        utmContent: data.utmContent ?? null,
        source: data.source ?? null,
        medium: data.medium ?? null,
        referrerDomain: data.referrerDomain ?? null,
        isSearchEngine: data.isSearchEngine ?? null,
        searchEngine: data.searchEngine ?? null,
        socialNetwork: data.socialNetwork ?? null,
        pageViewCount: incrementPageViews ? 1 : 0,
        startTime: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
      } satisfies InferInsertModel<typeof visitorSessions>)
      .onConflictDoUpdate({
        target: [visitorSessions.websiteId, visitorSessions.sessionId],
        set: updateSet as Partial<InferInsertModel<typeof visitorSessions>>,
      })
      .returning()

    return result
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("foreign key constraint")) return null
    throw e
  }
}
