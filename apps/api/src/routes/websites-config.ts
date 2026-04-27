/**
 * /api/websites/config/:trackingCode — served to the tracker.js snippet
 * on page load. Returns path exclusions, cookie consent, and whether
 * speed-insights ingest is enabled for this site.
 */
import { Hono } from 'hono'
import { and, eq } from 'drizzle-orm'
import { db } from '@ninelytics/shared/db'
import { websites } from '@ninelytics/db/schema'

export const websitesConfig = new Hono()

websitesConfig.options('/:trackingCode', (c) => c.body(null, 200))

websitesConfig.get('/:trackingCode', async (c) => {
  const trackingCode = c.req.param('trackingCode')
  try {
    const [row] = await db
      .select({
        excludedPaths: websites.excludedPaths,
        cookieConsent: websites.cookieConsent,
        speedInsightsEnabled: websites.speedInsightsEnabled,
        cookielessMode: websites.cookielessMode,
      })
      .from(websites)
      .where(and(eq(websites.trackingCode, trackingCode), eq(websites.status, 'ACTIVE')))
      .limit(1)

    if (!row) return c.json({ error: 'Website not found' }, 404)

    return c.json({
      excludedPaths: (row.excludedPaths as string[] | null) ?? [],
      cookieConsent: row.cookieConsent ?? null,
      speedInsights: row.speedInsightsEnabled ?? false,
      cookielessMode: row.cookielessMode ?? false,
    })
  } catch (error) {
    console.error('Error fetching website config:', error)
    return c.json({ error: 'Internal server error' }, 500)
  }
})
