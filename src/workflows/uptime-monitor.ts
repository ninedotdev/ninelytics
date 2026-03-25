import { sleep } from "workflow"

// ─── Types ──────────────────────────────────────────────────────────────────

type UptimeSettings = {
  id: string
  url: string
  ownerId: string
  uptimeEnabled: boolean
  uptimeKeyword: string | null
  uptimeInterval: number
  uptimeBaselineResponseTime: number | null
  uptimeContentHash: string | null
  lastUptimeStatus: string | null
}

// ─── Steps ──────────────────────────────────────────────────────────────────

async function loadUptimeEnabledIds(): Promise<string[]> {
  "use step"

  const { db } = await import("@/server/db/client")
  const { websites } = await import("@/server/db/schema")
  const { eq } = await import("drizzle-orm")

  const rows = await db
    .select({ id: websites.id })
    .from(websites)
    .where(eq(websites.uptimeEnabled, true))

  return rows.map((r) => r.id)
}

async function loadUptimeSettings(websiteId: string): Promise<UptimeSettings | null> {
  "use step"

  const { db } = await import("@/server/db/client")
  const { websites } = await import("@/server/db/schema")
  const { eq } = await import("drizzle-orm")

  const [website] = await db
    .select({
      id: websites.id,
      url: websites.url,
      ownerId: websites.ownerId,
      uptimeEnabled: websites.uptimeEnabled,
      uptimeKeyword: websites.uptimeKeyword,
      uptimeInterval: websites.uptimeInterval,
      uptimeBaselineResponseTime: websites.uptimeBaselineResponseTime,
      uptimeContentHash: websites.uptimeContentHash,
      lastUptimeStatus: websites.lastUptimeStatus,
    })
    .from(websites)
    .where(eq(websites.id, websiteId))
    .limit(1)

  if (!website || !website.uptimeEnabled) return null
  return website as UptimeSettings
}

async function runSingleCheck(websiteId: string): Promise<void> {
  "use step"

  const { db } = await import("@/server/db/client")
  const { websites, uptimeChecks, uptimeIncidents } = await import("@/server/db/schema")
  const { eq, and, isNull, sql } = await import("drizzle-orm")
  const { performHealthCheck } = await import("@/lib/uptime")
  const { notifyUptimeChange } = await import("@/lib/uptime-notifications")

  // Load settings
  const [website] = await db
    .select()
    .from(websites)
    .where(eq(websites.id, websiteId))
    .limit(1)

  if (!website?.uptimeEnabled) return

  // Perform the health check
  const result = await performHealthCheck(website.url, {
    keyword: website.uptimeKeyword ?? undefined,
    previousContentHash: website.uptimeContentHash ?? undefined,
    baselineResponseTime: website.uptimeBaselineResponseTime ?? undefined,
  })

  // Save check result
  await db.insert(uptimeChecks).values({
    websiteId,
    status: result.status,
    statusCode: result.statusCode,
    responseTime: result.responseTime,
    errorMessage: result.errorMessage ?? (result.issues.length > 0 ? result.issues.join(", ") : null),
    contentHash: result.contentHash,
  })

  // Update website last check info
  const updatedBaseline = result.status === "up" && result.responseTime > 0
    ? Math.round((website.uptimeBaselineResponseTime ?? result.responseTime) * 0.9 + result.responseTime * 0.1)
    : website.uptimeBaselineResponseTime

  await db.update(websites).set({
    lastUptimeCheck: new Date().toISOString(),
    lastUptimeStatus: result.status,
    uptimeBaselineResponseTime: updatedBaseline,
    // Set content hash baseline on first check only
    uptimeContentHash: website.uptimeContentHash ?? result.contentHash,
    uptimeSslExpiry: result.sslExpiryDays != null
      ? new Date(Date.now() + result.sslExpiryDays * 86400000).toISOString()
      : website.uptimeSslExpiry,
  }).where(eq(websites.id, websiteId))

  // Handle status transitions
  const previousStatus = website.lastUptimeStatus

  if (result.status !== "up" && (previousStatus === "up" || previousStatus === null)) {
    // Site just went down — open incident
    await db.insert(uptimeIncidents).values({
      websiteId,
      type: result.status,
      notifiedAt: new Date().toISOString(),
    })

    const eventType = result.status === "changed" ? "content_changed" as const
      : result.status === "degraded" ? "degraded" as const
      : "down" as const
    await notifyUptimeChange(websiteId, eventType, result)

  } else if (result.status === "up" && previousStatus != null && previousStatus !== "up") {
    // Site recovered — close open incident
    const openIncident = await db.query.uptimeIncidents.findFirst({
      where: and(
        eq(uptimeIncidents.websiteId, websiteId),
        isNull(uptimeIncidents.resolvedAt)
      ),
    })

    if (openIncident) {
      const startedAt = new Date(openIncident.startedAt).getTime()
      const durationSeconds = Math.round((Date.now() - startedAt) / 1000)

      // Estimate lost visitors from analytics averages
      const avgResult = await db.execute<{ avg_per_second: number }>(sql`
        SELECT COALESCE(
          SUM(count)::float / NULLIF(EXTRACT(EPOCH FROM (MAX(pv.timestamp) - MIN(pv.timestamp))), 0),
          0
        ) as avg_per_second
        FROM page_views pv
        WHERE pv.website_id = ${websiteId}
          AND pv.timestamp >= NOW() - INTERVAL '7 days'
      `)
      const avgPerSecond = Number((avgResult as unknown as Array<{ avg_per_second: number }>)[0]?.avg_per_second ?? 0)
      const estimatedLostVisitors = Math.round(avgPerSecond * durationSeconds)

      await db.update(uptimeIncidents).set({
        resolvedAt: new Date().toISOString(),
        durationSeconds,
        estimatedLostVisitors: estimatedLostVisitors > 0 ? estimatedLostVisitors : null,
      }).where(eq(uptimeIncidents.id, openIncident.id))
    }

    const incidentDuration = openIncident
      ? Math.round((Date.now() - new Date(openIncident.startedAt).getTime()) / 1000)
      : undefined
    const lostVisitors = openIncident?.estimatedLostVisitors ?? undefined

    await notifyUptimeChange(websiteId, "recovered", result, {
      durationSeconds: incidentDuration,
      estimatedLostVisitors: lostVisitors != null ? Number(lostVisitors) : undefined,
    })
  }

  // SSL expiry notification (separate from up/down)
  if (result.sslExpiryDays != null && result.sslExpiryDays < 14) {
    await notifyUptimeChange(websiteId, "ssl", result)
  }
}

// ─── Steps (fan-out) ────────────────────────────────────────────────────────

async function dispatchChecks(websiteIds: string[]) {
  "use step"

  const { start } = await import("workflow/api")
  const { uptimeCheckSingle } = await import("@/workflows/uptime-monitor")

  for (const id of websiteIds) {
    await start(uptimeCheckSingle, [id])
  }
}

// ─── Workflows ──────────────────────────────────────────────────────────────

/** Single health check for one website — short-lived workflow run */
export async function uptimeCheckSingle(websiteId: string) {
  "use workflow"
  await runSingleCheck(websiteId)
}

/** Background scheduler — fans out individual checks every 5 minutes */
export async function uptimeScheduler() {
  "use workflow"

  while (true) {
    const ids = await loadUptimeEnabledIds()

    if (ids.length > 0) {
      await dispatchChecks(ids)
    }

    await sleep("5m")
  }
}
