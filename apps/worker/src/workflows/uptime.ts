/**
 * Uptime monitoring, ported from the Next app's workflow-package version.
 * No durable-execution primitives: plain async, best-effort, caller wraps
 * in try/catch. If a check fails mid-run, next scheduler tick picks it up.
 */
import { eq, and, isNull, sql } from 'drizzle-orm'
import { db } from '@ninelytics/shared/db'
import { websites, uptimeChecks, uptimeIncidents } from '@ninelytics/db/schema'
import { performHealthCheck } from '@ninelytics/shared/uptime'
import { notifyUptimeChange } from '@ninelytics/shared/uptime-notifications'

export async function runUptimeCheckForSite(websiteId: string): Promise<void> {
  const [website] = await db
    .select()
    .from(websites)
    .where(eq(websites.id, websiteId))
    .limit(1)

  if (!website?.uptimeEnabled) return

  const result = await performHealthCheck(website.url, {
    keyword: website.uptimeKeyword ?? undefined,
    previousContentHash: website.uptimeContentHash ?? undefined,
    baselineResponseTime: website.uptimeBaselineResponseTime ?? undefined,
  })

  await db.insert(uptimeChecks).values({
    websiteId,
    status: result.status,
    statusCode: result.statusCode,
    responseTime: result.responseTime,
    errorMessage:
      result.errorMessage ??
      (result.issues.length > 0 ? result.issues.join(', ') : null),
    contentHash: result.contentHash,
  })

  const updatedBaseline =
    result.status === 'up' && result.responseTime > 0
      ? Math.round(
          (website.uptimeBaselineResponseTime ?? result.responseTime) * 0.9 +
            result.responseTime * 0.1,
        )
      : website.uptimeBaselineResponseTime

  await db
    .update(websites)
    .set({
      lastUptimeCheck: new Date().toISOString(),
      lastUptimeStatus: result.status,
      uptimeBaselineResponseTime: updatedBaseline,
      uptimeContentHash: website.uptimeContentHash ?? result.contentHash,
      uptimeSslExpiry:
        result.sslExpiryDays != null
          ? new Date(Date.now() + result.sslExpiryDays * 86400000).toISOString()
          : website.uptimeSslExpiry,
    })
    .where(eq(websites.id, websiteId))

  const previousStatus = website.lastUptimeStatus

  if (
    result.status !== 'up' &&
    (previousStatus === 'up' || previousStatus === null)
  ) {
    await db.insert(uptimeIncidents).values({
      websiteId,
      type: result.status,
      notifiedAt: new Date().toISOString(),
    })

    const eventType =
      result.status === 'changed'
        ? ('content_changed' as const)
        : result.status === 'degraded'
          ? ('degraded' as const)
          : ('down' as const)
    await notifyUptimeChange(websiteId, eventType, result)
  } else if (
    result.status === 'up' &&
    previousStatus != null &&
    previousStatus !== 'up'
  ) {
    const openIncident = await db.query.uptimeIncidents.findFirst({
      where: and(
        eq(uptimeIncidents.websiteId, websiteId),
        isNull(uptimeIncidents.resolvedAt),
      ),
    })

    if (openIncident) {
      const startedAt = new Date(openIncident.startedAt).getTime()
      const durationSeconds = Math.round((Date.now() - startedAt) / 1000)

      const avgResult = await db.execute<{ avg_per_second: number }>(sql`
        SELECT COALESCE(
          SUM(count)::float / NULLIF(EXTRACT(EPOCH FROM (MAX(pv.timestamp) - MIN(pv.timestamp))), 0),
          0
        ) as avg_per_second
        FROM page_views pv
        WHERE pv.website_id = ${websiteId}
          AND pv.timestamp >= NOW() - INTERVAL '7 days'
      `)
      const avgPerSecond = Number(
        (avgResult as unknown as Array<{ avg_per_second: number }>)[0]
          ?.avg_per_second ?? 0,
      )
      const estimatedLostVisitors = Math.round(avgPerSecond * durationSeconds)

      await db
        .update(uptimeIncidents)
        .set({
          resolvedAt: new Date().toISOString(),
          durationSeconds,
          estimatedLostVisitors:
            estimatedLostVisitors > 0 ? estimatedLostVisitors : null,
        })
        .where(eq(uptimeIncidents.id, openIncident.id))
    }

    const incidentDuration = openIncident
      ? Math.round(
          (Date.now() - new Date(openIncident.startedAt).getTime()) / 1000,
        )
      : undefined
    const lostVisitors = openIncident?.estimatedLostVisitors ?? undefined

    await notifyUptimeChange(websiteId, 'recovered', result, {
      durationSeconds: incidentDuration,
      estimatedLostVisitors:
        lostVisitors != null ? Number(lostVisitors) : undefined,
    })
  }

  if (result.sslExpiryDays != null && result.sslExpiryDays < 14) {
    await notifyUptimeChange(websiteId, 'ssl', result)
  }
}

/** Scan all sites with uptime enabled, run checks in parallel (bounded). */
export async function scanEnabledUptimeSites(): Promise<{
  checked: number
  failed: number
}> {
  const rows = await db
    .select({ id: websites.id })
    .from(websites)
    .where(eq(websites.uptimeEnabled, true))

  const results = await Promise.allSettled(
    rows.map((r) => runUptimeCheckForSite(r.id)),
  )
  let checked = 0
  let failed = 0
  for (const r of results) {
    if (r.status === 'fulfilled') checked++
    else {
      failed++
      console.error('[uptime-scan] check failed:', r.reason)
    }
  }
  return { checked, failed }
}
