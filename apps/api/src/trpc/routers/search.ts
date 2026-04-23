import { z } from "zod"
import { router, protectedProcedure } from "../trpc"
import { websites, users, goals } from "@ninelytics/db/schema"
import { or, ilike, eq, and } from "drizzle-orm"
import { userWebsiteAccess } from "@ninelytics/db/schema"

export const searchRouter = router({
  query: protectedProcedure
    .input(
      z.object({
        q: z.string().min(2, "Search query must be at least 2 characters"),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id
      const query = input.q.toLowerCase()

      // Search websites
      const userWebsites = await ctx.db.query.userWebsiteAccess.findMany({
        where: eq(userWebsiteAccess.userId, userId),
        columns: { websiteId: true },
      })

      const websiteIds = userWebsites.map((uw) => uw.websiteId)
      const ownedWebsites = await ctx.db.query.websites.findMany({
        where: eq(websites.ownerId, userId),
        columns: { id: true },
      })

      const allWebsiteIds = [
        ...websiteIds,
        ...ownedWebsites.map((w) => w.id),
      ]

      const matchingWebsites = await ctx.db.query.websites.findMany({
        where: and(
          or(
            ilike(websites.name, `%${query}%`),
            ilike(websites.url, `%${query}%`),
            ilike(websites.description, `%${query}%`)
          ),
          // Only show websites the user has access to
          allWebsiteIds.length > 0
            ? or(...allWebsiteIds.map((id) => eq(websites.id, id)))
            : undefined
        ),
        columns: {
          id: true,
          name: true,
          url: true,
          description: true,
        },
        limit: 5,
      })

      // Search users (only if admin)
      const currentUser = await ctx.db.query.users.findFirst({
        where: eq(users.id, userId),
        columns: { role: true },
      })

      let matchingUsers: Array<{
        id: string
        name: string | null
        email: string
      }> = []

      if (currentUser?.role === "ADMIN") {
        matchingUsers = await ctx.db.query.users.findMany({
          where: or(
            ilike(users.name, `%${query}%`),
            ilike(users.email, `%${query}%`)
          ),
          columns: {
            id: true,
            name: true,
            email: true,
          },
          limit: 5,
        })
      }

      // Search goals
      const matchingGoals = await ctx.db.query.goals.findMany({
        where: and(
          or(
            ilike(goals.name, `%${query}%`),
            ilike(goals.description, `%${query}%`)
          ),
          // Only show goals for websites the user has access to
          allWebsiteIds.length > 0
            ? or(...allWebsiteIds.map((id) => eq(goals.websiteId, id)))
            : undefined
        ),
        columns: {
          id: true,
          name: true,
          description: true,
          websiteId: true,
        },
        limit: 5,
      })

      const results = [
        ...matchingWebsites.map((w) => ({
          type: "website" as const,
          id: w.id,
          title: w.name,
          description: w.description || w.url,
          url: `/websites/${w.id}`,
        })),
        ...matchingUsers.map((u) => ({
          type: "user" as const,
          id: u.id,
          title: u.name || u.email,
          description: u.email,
          url: `/users/${u.id}`,
        })),
        ...matchingGoals.map((g) => ({
          type: "goal" as const,
          id: g.id,
          title: g.name,
          description: g.description || "",
          url: `/goals/${g.id}`,
        })),
      ]

      return {
        results,
        total: results.length,
      }
    }),
})

