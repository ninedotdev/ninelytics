import { sql, and, eq } from "drizzle-orm"
import { db } from "./db"
import { visitors, visitorSessions } from "@ninelytics/db/schema"
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

  // Minimal UPDATE set: a returning visitor only needs `lastVisit` bumped
  // so "active in last N days" filters work. Browser, OS, device, screen,
  // language, etc are immutable for a given visitor row — re-writing them
  // on every event was just taking the row lock with no data change. Geo
  // fields stay refreshable when a new lookup actually returned a value
  // (e.g. CF header upgrade for a previously-Unknown country).
  const updateSet: Record<string, unknown> = {
    lastVisit: nowIso,
    ...(data.country != null && { country: data.country }),
    ...(data.state != null && { state: data.state }),
    ...(data.city != null && { city: data.city }),
    ...(data.lat != null && { lat: String(data.lat) }),
    ...(data.lon != null && { lon: String(data.lon) }),
    updatedAt: nowIso,
  }

  // Per-event counter increments removed: totalPageViews and totalSessions
  // are write-only fields no SELECT query reads. The `+ 1` UPDATEs were
  // creating row-lock contention with no upside — totals are computed at
  // read time via `count(*)` over page_views / visitor_sessions, which is
  // already cheap thanks to (website_id, timestamp) and similar indexes.

  try {
    // No RETURNING — the result is never read (callers await for the
    // side-effect only). Returning the full row was costing ~20 columns
    // of serialization per insert × 3 round-trips per pageview.
    await db
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
  } catch (e: unknown) {
    // FK violation = website was deleted between check and insert — ignore
    if (e instanceof Error && e.message.includes("foreign key constraint")) return
    throw e
  }
}

/**
 * Lowercase + trim a referring host / UTM source / source value so the
 * Top Referrers and Traffic Sources breakdowns group case-insensitive
 * variants together (e.g. "Chatgpt.com" and "chatgpt.com" become one).
 */
function normalizeRef(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null
  const v = value.trim().toLowerCase()
  return v.length > 0 ? v : null
}

/**
 * Best-effort hostname extraction from a raw referrer URL. Used as a
 * fallback when the SDK didn't set referrerDomain (older script
 * versions, or events that arrived via /api/track/* without parsing).
 */
function deriveReferrerDomain(referrer: string | null | undefined): string | null {
  if (!referrer) return null
  try {
    return new URL(referrer).hostname.replace(/^www\./, "").toLowerCase() || null
  } catch {
    return null
  }
}

export async function upsertSession(
  data: SessionData,
  incrementPageViews = false
) {
  const nowIso = toIso(new Date())

  // Defensive normalization at write time — older SDK versions cached in
  // the wild (5min cache header) might still send raw / mixed-case
  // values. New SDK normalizes client-side too; together they make the
  // grouping correct regardless of which path produced the event.
  const normalizedReferrerDomain =
    normalizeRef(data.referrerDomain) ?? deriveReferrerDomain(data.referrer)
  const normalizedUtmSource = normalizeRef(data.utmSource)
  const normalizedSource = normalizeRef(data.source)

  // Sessions are write-once for tracking purposes: the first event creates
  // the row with full UTM / source / referrer / landing data, and that
  // row never needs further mutation from the upsert path. duration and
  // isBounce are written explicitly by the SDK's session-end ping via
  // updateSessionMetrics, not from here. endTime / exitPage can be
  // recomputed at read time as MAX(timestamp) / latest-page from
  // page_views when a dashboard cares.
  //
  // Switching to ON CONFLICT DO NOTHING removes the per-event row lock
  // entirely — concurrent pageviews on the same session no longer
  // serialize through an UPDATE.
  try {
    await db
      .insert(visitorSessions)
      .values({
        websiteId: data.websiteId,
        visitorId: data.visitorId,
        sessionId: data.sessionId,
        referrer: data.referrer ?? null,
        landingPage: data.landingPage ?? null,
        utmSource: normalizedUtmSource,
        utmMedium: normalizeRef(data.utmMedium),
        utmCampaign: data.utmCampaign ?? null,
        utmTerm: data.utmTerm ?? null,
        utmContent: data.utmContent ?? null,
        source: normalizedSource,
        medium: normalizeRef(data.medium),
        referrerDomain: normalizedReferrerDomain,
        isSearchEngine: data.isSearchEngine ?? null,
        searchEngine: data.searchEngine ?? null,
        socialNetwork: data.socialNetwork ?? null,
        pageViewCount: incrementPageViews ? 1 : 0,
        startTime: nowIso,
        createdAt: nowIso,
        updatedAt: nowIso,
      } satisfies InferInsertModel<typeof visitorSessions>)
      .onConflictDoNothing({
        target: [visitorSessions.websiteId, visitorSessions.sessionId],
      })
  } catch (e: unknown) {
    if (e instanceof Error && e.message.includes("foreign key constraint")) return
    throw e
  }
}

export async function updateSessionMetrics(
  websiteId: string,
  sessionId: string,
  metrics: {
    duration?: number
    pageViewCount?: number
    isBounce?: boolean
  }
) {
  await db
    .update(visitorSessions)
    .set({
      duration: metrics.duration ?? 0,
      pageViewCount: metrics.pageViewCount ?? 1,
      isBounce: metrics.isBounce !== undefined ? metrics.isBounce : (metrics.pageViewCount === 1),
      endTime: toIso(new Date()),
      updatedAt: toIso(new Date()),
    })
    .where(and(
      eq(visitorSessions.sessionId, sessionId),
      eq(visitorSessions.websiteId, websiteId)
    ))
}
