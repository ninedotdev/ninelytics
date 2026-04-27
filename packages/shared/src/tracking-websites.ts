import { and, eq } from "drizzle-orm"
import { db } from "./db"
import { websites } from "@ninelytics/db/schema"

type CachedWebsite = {
  id: string
  excludedPaths: string[]
  cookielessMode: boolean
  expiry: number
}

const websiteCache = new Map<string, CachedWebsite>()
const CACHE_TTL_MS = 60_000

export async function getActiveWebsiteByTrackingCode(trackingCode: string) {
  const cached = websiteCache.get(trackingCode)
  if (cached && cached.expiry > Date.now()) {
    return cached
  }

  const rows = await db
    .select({
      id: websites.id,
      excludedPaths: websites.excludedPaths,
      cookielessMode: websites.cookielessMode,
    })
    .from(websites)
    .where(and(eq(websites.trackingCode, trackingCode), eq(websites.status, "ACTIVE")))
    .limit(1)

  if (rows.length === 0) {
    websiteCache.delete(trackingCode)
    return null
  }

  const website = {
    id: rows[0].id,
    excludedPaths: (rows[0].excludedPaths as string[] | null) ?? [],
    cookielessMode: rows[0].cookielessMode ?? false,
    expiry: Date.now() + CACHE_TTL_MS,
  }

  websiteCache.set(trackingCode, website)
  return website
}

export function clearTrackingWebsiteCache(trackingCode?: string) {
  if (trackingCode) {
    websiteCache.delete(trackingCode)
    return
  }

  websiteCache.clear()
}
