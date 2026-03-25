import { sleep } from "workflow"
import crypto from "crypto"

// ─── Helpers ────────────────────────────────────────────────────────────────

function parseSitemapXml(xml: string): string[] {
  const urls: string[] = []
  const matches = xml.match(/<loc>(.*?)<\/loc>/g) ?? []
  for (const match of matches) {
    const url = match.replace(/<\/?loc>/g, "").trim()
    urls.push(url)
  }
  return urls.filter((url) => !url.endsWith(".xml"))
}

// ─── Steps (full Node.js runtime) ───────────────────────────────────────────

type WebsiteSettings = {
  sitemapUrl: string
  autoIndexEnabled: boolean
  indexNowEnabled: boolean
  indexNowKey: string | null
  url: string
  ownerId: string
  searchConsoleSiteUrl: string | null
}

async function loadWebsiteSettings(websiteId: string): Promise<WebsiteSettings | null> {
  "use step"

  const { db } = await import("@/server/db/client")
  const { websites } = await import("@/server/db/schema")
  const { eq } = await import("drizzle-orm")

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

async function loadAllAutoIndexIds(): Promise<string[]> {
  "use step"

  const { db } = await import("@/server/db/client")
  const { websites } = await import("@/server/db/schema")
  const { eq } = await import("drizzle-orm")

  const rows = await db
    .select({ id: websites.id })
    .from(websites)
    .where(eq(websites.autoIndexEnabled, true))

  return rows.map((r) => r.id)
}

async function fetchAndDiffSitemap(websiteId: string, sitemapUrl: string): Promise<string[]> {
  "use step"

  const { db } = await import("@/server/db/client")
  const { websites, sitemapUrls } = await import("@/server/db/schema")
  const { eq } = await import("drizzle-orm")

  console.log(`[sitemap] Fetching sitemap: ${sitemapUrl}`)
  const res = await fetch(sitemapUrl, { cache: "no-store" })
  if (!res.ok) throw new Error(`Failed to fetch sitemap: ${res.status}`)
  const xml = await res.text()

  const hash = crypto.createHash("md5").update(xml).digest("hex")
  const urls = parseSitemapXml(xml)
  console.log(`[sitemap] Found ${urls.length} URLs in sitemap`)

  const known = await db
    .select({ url: sitemapUrls.url })
    .from(sitemapUrls)
    .where(eq(sitemapUrls.websiteId, websiteId))
  const knownSet = new Set(known.map((r) => r.url))
  const newUrls = urls.filter((url) => !knownSet.has(url))
  console.log(`[sitemap] ${newUrls.length} new URLs to index (${knownSet.size} already known)`)

  if (newUrls.length > 0) {
    await db.insert(sitemapUrls)
      .values(newUrls.map((url) => ({ websiteId, url, googleStatus: "pending" })))
      .onConflictDoNothing()
  }

  await db.update(websites).set({
    lastSitemapCheck: new Date().toISOString(),
    lastSitemapHash: hash,
  }).where(eq(websites.id, websiteId))

  return newUrls
}

async function submitToIndexNow(websiteId: string, urls: string[], indexNowKey: string, domain: string): Promise<void> {
  "use step"

  if (urls.length === 0) return

  const { db } = await import("@/server/db/client")
  const { sitemapUrls } = await import("@/server/db/schema")
  const { and, eq, inArray } = await import("drizzle-orm")

  const host = new URL(domain.startsWith("http") ? domain : `https://${domain}`).hostname
  console.log(`[sitemap] Submitting ${urls.length} URLs to IndexNow for ${host}`)

  const res = await fetch("https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      host,
      key: indexNowKey,
      keyLocation: `https://${host}/${indexNowKey}.txt`,
      urlList: urls.slice(0, 10000),
    }),
  })

  if (!res.ok && res.status !== 202) {
    throw new Error(`IndexNow failed: ${res.status}`)
  }

  console.log(`[sitemap] IndexNow response: ${res.status}`)

  await db.update(sitemapUrls)
    .set({ indexNowSubmittedAt: new Date().toISOString() })
    .where(and(
      eq(sitemapUrls.websiteId, websiteId),
      inArray(sitemapUrls.url, urls)
    ))
}

async function loadPendingGoogleUrls(websiteId: string): Promise<string[]> {
  "use step"

  const { db } = await import("@/server/db/client")
  const { sitemapUrls } = await import("@/server/db/schema")
  const { and, eq, isNull } = await import("drizzle-orm")

  const { or } = await import("drizzle-orm")

  // Reset errors back to pending so UI shows correct state during retry
  await db.update(sitemapUrls)
    .set({ googleStatus: "pending", googleSubmittedAt: null })
    .where(and(
      eq(sitemapUrls.websiteId, websiteId),
      eq(sitemapUrls.googleStatus, "error")
    ))

  const { sql, lte } = await import("drizzle-orm")

  // Include: never submitted (pending) + submitted but not yet indexed (re-verify after 24h)
  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()

  const rows = await db
    .select({ url: sitemapUrls.url })
    .from(sitemapUrls)
    .where(and(
      eq(sitemapUrls.websiteId, websiteId),
      or(
        // Never submitted
        isNull(sitemapUrls.googleSubmittedAt),
        // Submitted but not yet indexed — re-check every 24h
        and(
          eq(sitemapUrls.googleStatus, "submitted"),
          lte(sitemapUrls.googleSubmittedAt, oneDayAgo)
        )
      )
    ))

  console.log(`[sitemap] ${rows.length} URLs pending Google check/submission`)
  return rows.map((r) => r.url)
}

// Returns: "indexed" | "submitted" | "skipped" | "error"
async function checkAndSubmitToGoogle(
  websiteId: string,
  url: string,
  userId: string,
  siteUrl: string | null
): Promise<"indexed" | "submitted" | "skipped" | "error"> {
  "use step"

  const { db } = await import("@/server/db/client")
  const { sitemapUrls } = await import("@/server/db/schema")
  const { and, eq } = await import("drizzle-orm")
  const { getValidAccessToken } = await import("@/lib/google-oauth")

  const accessToken = await getValidAccessToken(userId, db)
  if (!accessToken) {
    console.log(`[sitemap] Google not connected, skipping: ${url}`)
    return "skipped"
  }

  // Step 1: Check if already indexed via URL Inspection API (saves Indexing API quota)
  if (siteUrl) {
    const inspectRes = await fetch("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ inspectionUrl: url, siteUrl }),
    })

    if (inspectRes.ok) {
      const data = await inspectRes.json() as { inspectionResult?: { indexStatusResult?: { coverageState?: string } } }
      const coverageState = data.inspectionResult?.indexStatusResult?.coverageState ?? ""
      const isIndexed = coverageState.toLowerCase().includes("indexed")
      console.log(`[sitemap] Inspection: ${url} → ${coverageState}`)

      if (isIndexed) {
        await db.update(sitemapUrls).set({
          googleSubmittedAt: new Date().toISOString(),
          googleStatus: "indexed",
        }).where(and(eq(sitemapUrls.websiteId, websiteId), eq(sitemapUrls.url, url)))
        return "indexed"
      }
    }
  }

  // Step 2: Not indexed yet — submit to Indexing API
  const res = await fetch("https://indexing.googleapis.com/v3/urlNotifications:publish", {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, type: "URL_UPDATED" }),
  })

  const status = res.ok ? "submitted" : "error"
  if (!res.ok) {
    const body = await res.text().catch(() => "")
    console.log(`[sitemap] Google submit error (${res.status}): ${url} — ${body}`)
  } else {
    console.log(`[sitemap] Google submit submitted (${res.status}): ${url}`)
  }

  await db.update(sitemapUrls).set({
    googleSubmittedAt: new Date().toISOString(),
    googleStatus: status,
  }).where(and(eq(sitemapUrls.websiteId, websiteId), eq(sitemapUrls.url, url)))

  return status as "submitted" | "error"
}

// ─── Workflows (sandbox — only calls steps + sleep) ──────────────────────────

export async function pollAndIndexSitemap(websiteId: string) {
  "use workflow"

  const website = await loadWebsiteSettings(websiteId)
  if (!website) return

  // Fetch sitemap and find brand-new URLs
  const newUrls = await fetchAndDiffSitemap(websiteId, website.sitemapUrl)

  // IndexNow: only new URLs (batch, no rate limit)
  if (newUrls.length > 0 && website.indexNowEnabled && website.indexNowKey) {
    await submitToIndexNow(websiteId, newUrls, website.indexNowKey, website.url)
  }

  // Google: for each pending URL, check if already indexed first, then submit if not
  const pendingUrls = await loadPendingGoogleUrls(websiteId)
  for (const url of pendingUrls) {
    const result = await checkAndSubmitToGoogle(websiteId, url, website.ownerId, website.searchConsoleSiteUrl)
    // Only sleep after an actual Indexing API submission (respect 200/day quota)
    if (result === "submitted") await sleep("8m")
  }
}

export async function sitemapScheduler() {
  "use workflow"

  const { start } = await import("workflow/api")

  while (true) {
    const ids = await loadAllAutoIndexIds()

    for (const id of ids) {
      await start(pollAndIndexSitemap, [id])
    }

    await sleep("6h")
  }
}
