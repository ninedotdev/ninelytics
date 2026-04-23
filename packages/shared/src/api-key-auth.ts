import { createHash } from "crypto"
import { db } from "./db"
import { apiKeys, websites } from "@ninelytics/db/schema"
import { eq, sql } from "drizzle-orm"

export function hashApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex")
}

export function generateApiKey(): { key: string; hashedKey: string; keyPrefix: string } {
  const { randomBytes } = require("crypto")
  const keyBody = randomBytes(24).toString("hex")
  const key = `ak_live_${keyBody}`
  return { key, hashedKey: hashApiKey(key), keyPrefix: key.slice(0, 12) + "..." }
}

export interface ApiKeyAuth {
  userId: string
  websiteId: string | null
  scopes: string
}

export async function validateApiKey(request: Request): Promise<ApiKeyAuth | null> {
  const authHeader = request.headers.get("authorization")
  if (!authHeader?.startsWith("Bearer ak_live_")) return null

  const key = authHeader.slice(7) // Remove "Bearer "
  const hashed = hashApiKey(key)

  const [result] = await db
    .select({
      userId: apiKeys.userId,
      websiteId: apiKeys.websiteId,
      scopes: apiKeys.scopes,
      expiresAt: apiKeys.expiresAt,
    })
    .from(apiKeys)
    .where(eq(apiKeys.hashedKey, hashed))
    .limit(1)

  if (!result) return null
  if (result.expiresAt && new Date(result.expiresAt) < new Date()) return null

  // Update lastUsedAt (fire and forget)
  db.update(apiKeys).set({ lastUsedAt: new Date().toISOString() }).where(eq(apiKeys.hashedKey, hashed)).then(() => {})

  return { userId: result.userId, websiteId: result.websiteId, scopes: result.scopes }
}
