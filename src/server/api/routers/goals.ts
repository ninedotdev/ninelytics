import { z } from "zod"
import { router, protectedProcedure } from "../trpc"
import { db } from "@/server/db/client"
import { goals, websites, userWebsiteAccess, conversions, pageViews, visitors, searchConsoleData, stripeData } from "@/server/db/schema"
import { eq, and, or, desc, sql, inArray } from "drizzle-orm"

const GOAL_TYPES = ["PAGEVIEW", "EVENT", "DURATION", "REVENUE", "SEARCH_POSITION", "SEARCH_CLICKS"] as const

const createGoalSchema = z.object({
  websiteId: z.string(),
  name: z.string().min(1, "Goal name is required"),
  description: z.string().optional(),
  type: z.enum(GOAL_TYPES),
  targetValue: z.string().min(1, "Target value is required"),
  targetQuery: z.string().optional(),
  threshold: z.number().min(1, "Threshold must be at least 1"),
  targetUnit: z.enum(["TOTAL", "PER_SESSION", "PER_VISITOR"]),
  isActive: z.boolean().default(true),
})

const updateGoalSchema = z.object({
  name: z.string().min(1, "Goal name is required").optional(),
  description: z.string().optional(),
  type: z.enum(GOAL_TYPES).optional(),
  targetValue: z.string().min(1, "Target value is required").optional(),
  targetQuery: z.string().nullable().optional(),
  threshold: z.number().min(1, "Threshold must be at least 1").optional(),
  targetUnit: z.enum(["TOTAL", "PER_SESSION", "PER_VISITOR"]).optional(),
  isActive: z.boolean().optional(),
})

async function ensureGoalAccess(db: typeof import("@/server/db/client").db, goalId: string, userId: string, requireWrite = false) {
  // Get goal with website info
  const goalData = await db
    .select({
      goal: goals,
      websiteId: websites.id,
      websiteOwnerId: websites.ownerId,
      websiteName: websites.name,
    })
    .from(goals)
    .innerJoin(websites, eq(goals.websiteId, websites.id))
    .where(eq(goals.id, goalId))
    .limit(1)

  if (goalData.length === 0) {
    throw new Error("Goal not found")
  }

  const { goal, websiteId, websiteOwnerId, websiteName } = goalData[0]!

  // Check if user has access to the website
  const userAccess = await db
    .select({ accessLevel: userWebsiteAccess.accessLevel })
    .from(userWebsiteAccess)
    .where(
      and(
        eq(userWebsiteAccess.websiteId, websiteId),
        eq(userWebsiteAccess.userId, userId)
      )
    )
    .limit(1)

  const hasAccess = websiteOwnerId === userId || userAccess.length > 0

  if (!hasAccess) {
    throw new Error("Forbidden")
  }

  if (requireWrite) {
    const hasWriteAccess =
      websiteOwnerId === userId ||
      userAccess.some(
        (access) => access.accessLevel === "ADMIN" || access.accessLevel === "WRITE"
      )

    if (!hasWriteAccess) {
      throw new Error("Forbidden")
    }
  }

  return {
    ...goal,
    website: {
      id: websiteId,
      name: websiteName,
      ownerId: websiteOwnerId,
      userAccess: userAccess.map((a) => ({ accessLevel: a.accessLevel })),
    },
  }
}

export const goalsRouter = router({
  list: protectedProcedure
    .input(
      z.object({
        websiteId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id
      const { websiteId } = input

      // Check website access
      const websiteRows = await db
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
      
      const website = websiteRows[0]

      if (!website) {
        throw new Error("Website not found")
      }

      const goalsList = await db.query.goals.findMany({
        where: eq(goals.websiteId, websiteId),
        orderBy: [desc(goals.createdAt)],
      })

      // Get conversion counts in a single query instead of N+1
      const goalIds = goalsList.map((g) => g.id)
      const conversionCounts = goalIds.length > 0
        ? await db
            .select({
              goalId: conversions.goalId,
              count: sql<number>`count(*)`,
            })
            .from(conversions)
            .where(inArray(conversions.goalId, goalIds))
            .groupBy(conversions.goalId)
        : []

      const countsMap = new Map(conversionCounts.map((c) => [c.goalId, Number(c.count)]))

      return goalsList.map((goal) => ({
        ...goal,
        _count: {
          conversions: countsMap.get(goal.id) ?? 0,
        },
      }))
    }),

  create: protectedProcedure
    .input(createGoalSchema)
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id

      // Check website access (requires ADMIN level)
      const websiteData = await db
        .select({
          id: websites.id,
          ownerId: websites.ownerId,
        })
        .from(websites)
        .where(eq(websites.id, input.websiteId))
        .limit(1)

      if (websiteData.length === 0) {
        throw new Error("Website not found")
      }

      const website = websiteData[0]!

      // Check user access
      const userAccess = await db
        .select({ accessLevel: userWebsiteAccess.accessLevel })
        .from(userWebsiteAccess)
        .where(
          and(
            eq(userWebsiteAccess.websiteId, input.websiteId),
            eq(userWebsiteAccess.userId, userId)
          )
        )
        .limit(1)

      const hasAccess =
        website.ownerId === userId ||
        userAccess.some((access) => access.accessLevel === "ADMIN")

      if (!hasAccess) {
        throw new Error("Website not found or insufficient permissions")
      }

      const [newGoal] = await db
        .insert(goals)
        .values({
          websiteId: input.websiteId,
          name: input.name,
          description: input.description,
          type: input.type,
          targetValue: input.targetValue,
          targetQuery: input.targetQuery || null,
          threshold: input.threshold,
          targetUnit: input.targetUnit,
          isActive: input.isActive,
        })
        .returning()

      const conversionsCount = await db
        .select({ count: sql<number>`count(*)` })
        .from(conversions)
        .where(eq(conversions.goalId, newGoal.id))

      return {
        ...newGoal,
        _count: {
          conversions: Number(conversionsCount[0]?.count ?? 0),
        },
      }
    }),

  byId: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id
      const goal = await ensureGoalAccess(ctx.db, input.id, userId)

      const conversionsCount = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(conversions)
        .where(eq(conversions.goalId, goal.id))

      return {
        ...goal,
        _count: {
          conversions: Number(conversionsCount[0]?.count ?? 0),
        },
      }
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        data: updateGoalSchema,
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id
      await ensureGoalAccess(ctx.db, input.id, userId, true)

      const [updated] = await ctx.db
        .update(goals)
        .set(input.data)
        .where(eq(goals.id, input.id))
        .returning()

      const conversionsCount = await ctx.db
        .select({ count: sql<number>`count(*)` })
        .from(conversions)
        .where(eq(conversions.goalId, updated.id))

      return {
        ...updated,
        _count: {
          conversions: Number(conversionsCount[0]?.count ?? 0),
        },
      }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id
      const goal = await ensureGoalAccess(ctx.db, input.id, userId, false)

      // Check delete access (owner or ADMIN)
      const hasDeleteAccess =
        goal.website.ownerId === userId ||
        goal.website.userAccess.some((access) => access.accessLevel === "ADMIN")

      if (!hasDeleteAccess) {
        throw new Error("Forbidden")
      }

      await ctx.db.delete(goals).where(eq(goals.id, input.id))

      return { message: "Goal deleted successfully" }
    }),

  stats: protectedProcedure
    .input(z.object({ id: z.string(), days: z.number().default(30) }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id
      await ensureGoalAccess(ctx.db, input.id, userId)

      const startDate = new Date()
      startDate.setDate(startDate.getDate() - input.days)

      // Get the goal to know its websiteId
      const goal = await ensureGoalAccess(ctx.db, input.id, userId)

      // Run all stats queries in parallel
      const [
        conversionStatsResult,
        conversionsOverTime,
        totalVisitorsResult,
        topPagesResult,
      ] = await Promise.all([
        // Conversion count + unique converters + total value
        ctx.db
          .select({
            count: sql<number>`count(*)`,
            uniqueConverters: sql<number>`count(DISTINCT ${conversions.visitorId})`,
            totalValue: sql<number>`coalesce(sum(${conversions.value}::numeric), 0)`,
          })
          .from(conversions)
          .where(and(
            eq(conversions.goalId, input.id),
            sql`${conversions.timestamp} >= ${startDate.toISOString()}`
          )),

        // Conversions over time (daily)
        ctx.db
          .select({
            date: sql<string>`DATE(${conversions.timestamp})::text`,
            count: sql<number>`count(*)`,
          })
          .from(conversions)
          .where(and(
            eq(conversions.goalId, input.id),
            sql`${conversions.timestamp} >= ${startDate.toISOString()}`
          ))
          .groupBy(sql`DATE(${conversions.timestamp})`)
          .orderBy(sql`DATE(${conversions.timestamp})`),

        // Total unique visitors for conversion rate denominator
        ctx.db
          .select({ count: sql<number>`count(DISTINCT ${visitors.visitorId})` })
          .from(visitors)
          .where(and(
            eq(visitors.websiteId, goal.websiteId),
            sql`${visitors.createdAt} >= ${startDate.toISOString()}`
          )),

        // Top pages where conversions happened (via session → pageview join)
        ctx.db.execute<{ page: string; count: number }>(sql`
          SELECT pv.page, COUNT(DISTINCT c.id)::int as count
          FROM conversions c
          INNER JOIN page_views pv ON pv.session_id = c.session_id AND pv.website_id = c.website_id
          WHERE c.goal_id = ${input.id}
            AND c.timestamp >= ${startDate.toISOString()}
          GROUP BY pv.page
          ORDER BY count DESC
          LIMIT 5
        `),
      ])

      const totalConversions = Number(conversionStatsResult[0]?.count ?? 0)
      const uniqueConvertersCount = Number(conversionStatsResult[0]?.uniqueConverters ?? 0)
      const totalValue = Number(conversionStatsResult[0]?.totalValue ?? 0)
      const totalVisitors = Number(totalVisitorsResult[0]?.count ?? 0)
      const conversionRate = totalVisitors > 0 ? (uniqueConvertersCount / totalVisitors) * 100 : 0

      return {
        totalConversions,
        uniqueConverters: uniqueConvertersCount,
        totalValue,
        conversionRate,
        conversionsOverTime: conversionsOverTime.map((item) => ({
          date: item.date,
          count: Number(item.count),
        })),
        topPages: (topPagesResult as unknown as Array<{ page: string; count: number }>).map((item) => ({
          page: item.page || "Unknown",
          count: Number(item.count),
        })),
      }
    }),

  // Top search queries from synced Search Console data (for goal creation UI)
  topSearchQueries: protectedProcedure
    .input(z.object({ websiteId: z.string(), limit: z.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const last30 = new Date()
      last30.setDate(last30.getDate() - 30)

      const rows = await ctx.db
        .select({
          query: searchConsoleData.query,
          clicks: sql<number>`sum(${searchConsoleData.clicks})`,
          impressions: sql<number>`sum(${searchConsoleData.impressions})`,
          avgPosition: sql<number>`round(avg(${searchConsoleData.position}::numeric), 1)`,
        })
        .from(searchConsoleData)
        .where(and(
          eq(searchConsoleData.websiteId, input.websiteId),
          sql`${searchConsoleData.recordDate} >= ${last30.toISOString().slice(0, 10)}`
        ))
        .groupBy(searchConsoleData.query)
        .orderBy(desc(sql`sum(${searchConsoleData.clicks})`))
        .limit(input.limit)

      return rows.map((r) => ({
        query: r.query,
        clicks: Number(r.clicks),
        impressions: Number(r.impressions),
        avgPosition: Number(r.avgPosition),
      }))
    }),

  // Evaluate REVENUE and SEARCH goals against synced integration data
  checkIntegrationGoals: protectedProcedure
    .input(z.object({ websiteId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id

      const websiteRows = await db
        .select({ id: websites.id })
        .from(websites)
        .leftJoin(userWebsiteAccess, eq(userWebsiteAccess.websiteId, websites.id))
        .where(and(
          eq(websites.id, input.websiteId),
          or(eq(websites.ownerId, userId), eq(userWebsiteAccess.userId, userId))
        ))
        .limit(1)

      if (websiteRows.length === 0) throw new Error("Website not found")

      const { checkIntegrationGoals } = await import("@/lib/integration-goals")
      return checkIntegrationGoals(ctx.db, input.websiteId)
    }),
})

