/**
 * Sitemap polling + Google/IndexNow submission, ported from the Next app's
 * workflow-package version. No durable-execution: plain async. If we crash
 * mid-run, next scheduler tick reprocesses from the queue state.
 *
 * The 8-minute sleep between Google Indexing API submissions is preserved
 * (their 200/day quota). This means one sitemap-poll run can take hours
 * if the site has many pending URLs — that's fine, worker handles it async.
 */
import crypto from 'node:crypto'
import { and, eq, inArray, isNull, lte, or } from 'drizzle-orm'
import { db } from '@ninelytics/shared/db'
import { websites, sitemapUrls } from '@ninelytics/db/schema'
import { getValidAccessToken } from '@ninelytics/shared/google-oauth'

type WebsiteSettings = {
  sitemapUrl: string
  autoIndexEnabled: boolean
  indexNowEnabled: boolean
  indexNowKey: string | null
  url: string
  ownerId: string
  searchConsoleSiteUrl: string | null
}

function parseSitemapXml(xml: string): string[] {
  const urls: string[] = []
  const matches = xml.match(/<loc>(.*?)<\/loc>/g) ?? []
  for (const match of matches) {
    const url = match.replace(/<\/?loc>/g, '').trim()
    urls.push(url)
  }
  return urls.filter((url) => !url.endsWith('.xml'))
}

async function loadWebsiteSettings(
  websiteId: string,
): Promise<WebsiteSettings | null> {
  const [website] = await db
    .select()
    .from(websites)
    .where(eq(websites.id, websiteId))
    .limit(1)
  if (!website?.sitemapUrl || !website.autoIndexEnabled) return null
  return {
    sitemapUrl: website.sitemapUrl,
    autoIndexEnabled: website.autoIndexEnabled,
    indexNowEnabled: website.indexNowEnabled ?? false,
    indexNowKey: website.indexNowKey ?? null,
    url: website.url,
    ownerId: website.ownerId,
    searchConsoleSiteUrl: website.searchConsoleSiteUrl ?? null,
  }
}

async function fetchAndDiffSitemap(
  websiteId: string,
  sitemapUrl: string,
): Promise<string[]> {
  console.log(`[sitemap] Fetching sitemap: ${sitemapUrl}`)

  const res = await fetch(sitemapUrl, {
    headers: {
      Accept: 'application/xml,text/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent':
        'Mozilla/5.0 (compatible; AnaliticsBot/1.0; +https://analitics.app)',
    },
    signal: AbortSignal.timeout(20_000),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    const details = body.replace(/\s+/g, ' ').trim().slice(0, 240)
    throw new Error(
      `Failed to fetch sitemap: ${res.status}${details ? ` ${details}` : ''}`,
    )
  }

  const xml = await res.text()
  const hash = crypto.createHash('md5').update(xml).digest('hex')
  const urls = parseSitemapXml(xml)
  console.log(`[sitemap] Found ${urls.length} URLs in sitemap`)

  const known = await db
    .select({ url: sitemapUrls.url })
    .from(sitemapUrls)
    .where(eq(sitemapUrls.websiteId, websiteId))
  const knownSet = new Set(known.map((r) => r.url))
  const newUrls = urls.filter((url) => !knownSet.has(url))
  console.log(
    `[sitemap] ${newUrls.length} new URLs to index (${knownSet.size} known)`,
  )

  if (newUrls.length > 0) {
    await db
      .insert(sitemapUrls)
      .values(newUrls.map((url) => ({ websiteId, url, googleStatus: 'pending' })))
      .onConflictDoNothing()
  }

  await db
    .update(websites)
    .set({
      lastSitemapCheck: new Date().toISOString(),
      lastSitemapHash: hash,
    })
    .where(eq(websites.id, websiteId))

  return newUrls
}

async function submitToIndexNow(
  websiteId: string,
  urls: string[],
  indexNowKey: string,
  domain: string,
): Promise<void> {
  if (urls.length === 0) return

  const host = new URL(
    domain.startsWith('http') ? domain : `https://${domain}`,
  ).hostname

  const validUrls = urls.filter((u) => {
    try {
      return new URL(u).hostname.replace('www.', '') === host.replace('www.', '')
    } catch {
      return false
    }
  })
  if (validUrls.length === 0) return

  console.log(`[sitemap] Submitting ${validUrls.length} URLs to IndexNow`)

  const BATCH = 100
  for (let i = 0; i < validUrls.length; i += BATCH) {
    const batch = validUrls.slice(i, i + BATCH)
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        host,
        key: indexNowKey,
        keyLocation: `https://${host}/${indexNowKey}.txt`,
        urlList: batch,
      }),
    })
    if (!res.ok && res.status !== 202) {
      const body = await res.text().catch(() => '')
      console.warn(`[sitemap] IndexNow batch error (${res.status}): ${body}`)
    }
  }

  await db
    .update(sitemapUrls)
    .set({ indexNowSubmittedAt: new Date().toISOString() })
    .where(
      and(eq(sitemapUrls.websiteId, websiteId), inArray(sitemapUrls.url, urls)),
    )
}

async function loadPendingGoogleUrls(websiteId: string): Promise<string[]> {
  await db
    .update(sitemapUrls)
    .set({ googleStatus: 'pending', googleSubmittedAt: null })
    .where(
      and(
        eq(sitemapUrls.websiteId, websiteId),
        eq(sitemapUrls.googleStatus, 'error'),
      ),
    )

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
  const rows = await db
    .select({ url: sitemapUrls.url })
    .from(sitemapUrls)
    .where(
      and(
        eq(sitemapUrls.websiteId, websiteId),
        or(
          isNull(sitemapUrls.googleSubmittedAt),
          and(
            eq(sitemapUrls.googleStatus, 'submitted'),
            lte(sitemapUrls.googleSubmittedAt, oneDayAgo),
          ),
        ),
      ),
    )
  console.log(`[sitemap] ${rows.length} URLs pending Google check/submission`)
  return rows.map((r) => r.url)
}

async function checkAndSubmitToGoogle(
  websiteId: string,
  url: string,
  userId: string,
  siteUrl: string | null,
): Promise<'indexed' | 'submitted' | 'skipped' | 'error'> {
  const accessToken = await getValidAccessToken(userId, db)
  if (!accessToken) return 'skipped'

  if (siteUrl) {
    const inspectRes = await fetch(
      'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ inspectionUrl: url, siteUrl }),
      },
    )
    if (inspectRes.ok) {
      const data = (await inspectRes.json()) as {
        inspectionResult?: {
          indexStatusResult?: { coverageState?: string }
        }
      }
      const coverageState = data.inspectionResult?.indexStatusResult?.coverageState ?? ''
      if (coverageState.toLowerCase().includes('indexed')) {
        await db
          .update(sitemapUrls)
          .set({
            googleSubmittedAt: new Date().toISOString(),
            googleStatus: 'indexed',
          })
          .where(
            and(eq(sitemapUrls.websiteId, websiteId), eq(sitemapUrls.url, url)),
          )
        return 'indexed'
      }
    }
  }

  const res = await fetch(
    'https://indexing.googleapis.com/v3/urlNotifications:publish',
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url, type: 'URL_UPDATED' }),
    },
  )
  const status = res.ok ? 'submitted' : 'error'
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    console.log(`[sitemap] Google submit error (${res.status}): ${url} — ${body}`)
  }
  await db
    .update(sitemapUrls)
    .set({ googleSubmittedAt: new Date().toISOString(), googleStatus: status })
    .where(
      and(eq(sitemapUrls.websiteId, websiteId), eq(sitemapUrls.url, url)),
    )
  return status as 'submitted' | 'error'
}

export async function runSitemapPollForSite(websiteId: string): Promise<void> {
  const website = await loadWebsiteSettings(websiteId)
  if (!website) return

  const newUrls = await fetchAndDiffSitemap(websiteId, website.sitemapUrl)
  if (newUrls.length > 0 && website.indexNowEnabled && website.indexNowKey) {
    await submitToIndexNow(websiteId, newUrls, website.indexNowKey, website.url)
  }

  const pendingUrls = await loadPendingGoogleUrls(websiteId)
  for (const url of pendingUrls) {
    const result = await checkAndSubmitToGoogle(
      websiteId,
      url,
      website.ownerId,
      website.searchConsoleSiteUrl,
    )
    // Respect Google Indexing API 200/day quota — same 8-minute gap as old version
    if (result === 'submitted') {
      await new Promise((r) => setTimeout(r, 8 * 60 * 1000))
    }
  }
}

export async function scanAutoIndexSites(): Promise<{ scanned: number; failed: number }> {
  const rows = await db
    .select({ id: websites.id })
    .from(websites)
    .where(eq(websites.autoIndexEnabled, true))

  const results = await Promise.allSettled(
    rows.map((r) => runSitemapPollForSite(r.id)),
  )
  let scanned = 0
  let failed = 0
  for (const r of results) {
    if (r.status === 'fulfilled') scanned++
    else {
      failed++
      console.error('[sitemap-scan] poll failed:', r.reason)
    }
  }
  return { scanned, failed }
}
