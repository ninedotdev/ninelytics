import { and, eq } from "drizzle-orm"
import { userWebsiteAccess, websites } from "@ninelytics/db/schema"
import type { DB } from "@ninelytics/shared/db"

export const ensureAccess = async (db: DB, websiteId: string, userId: string, requireWrite = false) => {
  const owner = await db
    .select({ id: websites.id })
    .from(websites)
    .where(and(eq(websites.id, websiteId), eq(websites.ownerId, userId)))
    .limit(1)

  if (owner.length > 0) return true

  const access = await db
    .select({
      level: userWebsiteAccess.accessLevel,
    })
    .from(userWebsiteAccess)
    .where(and(eq(userWebsiteAccess.websiteId, websiteId), eq(userWebsiteAccess.userId, userId)))
    .limit(1)

  if (access.length === 0) return false
  if (!requireWrite) return true

  return (
    access[0].level === "ADMIN" ||
    access[0].level === "WRITE"
  )
}
