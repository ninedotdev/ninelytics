import { z } from "zod"
import { router, protectedProcedure } from "../trpc"
import { realtimeHelpers } from "@ninelytics/shared/redis"
import { db } from "@ninelytics/shared/db"
import { websites, userWebsiteAccess } from "@ninelytics/db/schema"
import { eq, and, or } from "drizzle-orm"

async function ensureWebsiteAccess(
  dbInstance: typeof db,
  websiteId: string,
  userId: string
) {
  const rows = await dbInstance
    .select({
      id: websites.id,
      name: websites.name,
      url: websites.url,
    })
    .from(websites)
    .leftJoin(userWebsiteAccess, eq(userWebsiteAccess.websiteId, websites.id))
    .where(
      and(
        eq(websites.id, websiteId),
        or(eq(websites.ownerId, userId), eq(userWebsiteAccess.userId, userId))
      )
    )
    .limit(1)

  if (rows.length === 0) {
    throw new Error("Website not found")
  }

  return rows[0]
}

export const realtimeRouter = router({
  byWebsiteId: protectedProcedure
    .input(z.object({ websiteId: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id
      await ensureWebsiteAccess(ctx.db, input.websiteId, userId)

      // Fetch all real-time data
      const [
        activeCount,
        activeVisitors,
        activePages,
        liveEvents,
        geoData,
      ] = await Promise.all([
        realtimeHelpers.getActiveVisitorCount(input.websiteId),
        realtimeHelpers.getActiveVisitors(input.websiteId),
        realtimeHelpers.getActivePages(input.websiteId),
        realtimeHelpers.getLiveEvents(input.websiteId, 20),
        realtimeHelpers.getGeoData(input.websiteId),
      ])

      return {
        activeVisitors: activeCount,
        visitors: activeVisitors,
        activePages,
        liveEvents,
        geography: geoData,
        timestamp: Date.now(),
      }
    }),
})

