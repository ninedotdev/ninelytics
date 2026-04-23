import { z } from "zod"
import { router, protectedProcedure } from "../trpc"
import { funnels, funnelSteps, pageViews, events, websites, userWebsiteAccess } from "@ninelytics/db/schema"
import { eq, and, or, sql, desc, asc } from "drizzle-orm"

const ensureWebsiteAccess = async (db: typeof import("@ninelytics/shared/db").db, websiteId: string, userId: string) => {
  const rows = await db
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

const ensureFunnelAccess = async (db: typeof import("@ninelytics/shared/db").db, funnelId: string, userId: string) => {
  const rows = await db
    .select({
      funnel: funnels,
      websiteOwnerId: websites.ownerId,
    })
    .from(funnels)
    .innerJoin(websites, eq(funnels.websiteId, websites.id))
    .leftJoin(userWebsiteAccess, eq(userWebsiteAccess.websiteId, websites.id))
    .where(
      and(
        eq(funnels.id, funnelId),
        or(eq(websites.ownerId, userId), eq(userWebsiteAccess.userId, userId))
      )
    )
    .limit(1)

  if (rows.length === 0) {
    throw new Error("Funnel not found")
  }

  return rows[0]!.funnel
}

const stepSchema = z.object({
  name: z.string().min(1),
  type: z.enum(["pageview", "event"]),
  targetValue: z.string().min(1),
  targetMatch: z.enum(["exact", "contains", "regex"]).default("exact"),
})

export const funnelsRouter = router({
  // List distinct event names + top pages for autocomplete in funnel step creation
  suggestions: protectedProcedure
    .input(z.object({ websiteId: z.string() }))
    .query(async ({ ctx, input }) => {
      await ensureWebsiteAccess(ctx.db, input.websiteId, ctx.session!.user.id)

      const [eventNames, topPages] = await Promise.all([
        ctx.db
          .select({ name: events.eventName, count: sql<number>`count(*)` })
          .from(events)
          .where(eq(events.websiteId, input.websiteId))
          .groupBy(events.eventName)
          .orderBy(desc(sql`count(*)`))
          .limit(50),
        ctx.db
          .select({ page: pageViews.page, count: sql<number>`count(*)` })
          .from(pageViews)
          .where(eq(pageViews.websiteId, input.websiteId))
          .groupBy(pageViews.page)
          .orderBy(desc(sql`count(*)`))
          .limit(50),
      ])

      return {
        eventNames: eventNames.map(e => e.name),
        pages: topPages.map(p => p.page),
      }
    }),

  list: protectedProcedure
    .input(z.object({ websiteId: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id
      await ensureWebsiteAccess(ctx.db, input.websiteId, userId)

      const rows = await ctx.db
        .select({
          id: funnels.id,
          websiteId: funnels.websiteId,
          name: funnels.name,
          description: funnels.description,
          createdAt: funnels.createdAt,
          updatedAt: funnels.updatedAt,
          stepCount: sql<number>`count(${funnelSteps.id})::int`,
        })
        .from(funnels)
        .leftJoin(funnelSteps, eq(funnelSteps.funnelId, funnels.id))
        .where(eq(funnels.websiteId, input.websiteId))
        .groupBy(funnels.id)
        .orderBy(desc(funnels.createdAt))

      return rows
    }),

  create: protectedProcedure
    .input(
      z.object({
        websiteId: z.string(),
        name: z.string().min(1),
        description: z.string().optional(),
        steps: z.array(stepSchema).min(1),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id
      await ensureWebsiteAccess(ctx.db, input.websiteId, userId)

      const [funnel] = await ctx.db
        .insert(funnels)
        .values({
          websiteId: input.websiteId,
          name: input.name,
          description: input.description,
        })
        .returning()

      if (!funnel) throw new Error("Failed to create funnel")

      const stepsToInsert = input.steps.map((step, index) => ({
        funnelId: funnel.id,
        stepOrder: index,
        name: step.name,
        type: step.type,
        targetValue: step.targetValue,
        targetMatch: step.targetMatch,
      }))

      await ctx.db.insert(funnelSteps).values(stepsToInsert)

      return funnel
    }),

  getById: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id
      const funnel = await ensureFunnelAccess(ctx.db, input.id, userId)

      const steps = await ctx.db
        .select()
        .from(funnelSteps)
        .where(eq(funnelSteps.funnelId, input.id))
        .orderBy(asc(funnelSteps.stepOrder))

      return { ...funnel, steps }
    }),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        steps: z.array(stepSchema).min(1).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id
      await ensureFunnelAccess(ctx.db, input.id, userId)

      const updateData: Record<string, unknown> = {
        updatedAt: new Date().toISOString(),
      }
      if (input.name !== undefined) updateData.name = input.name
      if (input.description !== undefined) updateData.description = input.description

      await ctx.db
        .update(funnels)
        .set(updateData)
        .where(eq(funnels.id, input.id))

      if (input.steps) {
        await ctx.db.delete(funnelSteps).where(eq(funnelSteps.funnelId, input.id))

        const stepsToInsert = input.steps.map((step, index) => ({
          funnelId: input.id,
          stepOrder: index,
          name: step.name,
          type: step.type,
          targetValue: step.targetValue,
          targetMatch: step.targetMatch,
        }))

        await ctx.db.insert(funnelSteps).values(stepsToInsert)
      }

      return { success: true }
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id
      await ensureFunnelAccess(ctx.db, input.id, userId)

      await ctx.db.delete(funnels).where(eq(funnels.id, input.id))

      return { success: true }
    }),

  analyze: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        startDate: z.string().optional(),
        endDate: z.string().optional(),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session!.user.id
      const funnel = await ensureFunnelAccess(ctx.db, input.id, userId)

      const steps = await ctx.db
        .select()
        .from(funnelSteps)
        .where(eq(funnelSteps.funnelId, input.id))
        .orderBy(asc(funnelSteps.stepOrder))

      if (steps.length === 0) {
        return []
      }

      // Determine date range
      let startDate: string
      let endDate: string

      if (input.startDate) {
        startDate = input.startDate
      } else {
        const d = new Date()
        d.setUTCDate(d.getUTCDate() - 30)
        startDate = d.toISOString().split("T")[0]!
      }

      if (input.endDate) {
        endDate = input.endDate
      } else {
        endDate = new Date().toISOString().split("T")[0]!
      }

      const startTs = `${startDate}T00:00:00.000Z`
      const endTs = `${endDate}T23:59:59.999Z`

      // Check if any steps are event-type
      const hasEventSteps = steps.some((s) => s.type === "event")

      // Build the step_hits CTE columns dynamically
      const stepMinColumns = steps
        .map((step, i) => {
          const idx = i + 1
          if (step.type === "pageview") {
            const matchExpr = buildMatchExpr("combined.page", step.targetValue, step.targetMatch)
            return `MIN(combined.timestamp) FILTER (WHERE ${matchExpr}) as step${idx}_at`
          } else {
            const matchExpr = buildMatchExpr("combined.page", step.targetValue, step.targetMatch)
            return `MIN(combined.timestamp) FILTER (WHERE ${matchExpr}) as step${idx}_at`
          }
        })
        .join(",\n    ")

      // Build the source query - always include page_views, optionally union events
      let sourceQuery: string
      if (hasEventSteps) {
        sourceQuery = `
          (
            SELECT pv.session_id, pv.page, pv.timestamp
            FROM page_views pv
            WHERE pv.website_id = '${funnel.websiteId}'
              AND pv.timestamp >= '${startTs}' AND pv.timestamp <= '${endTs}'
            UNION ALL
            SELECT e.session_id, e.event_name as page, e.timestamp
            FROM events e
            WHERE e.website_id = '${funnel.websiteId}'
              AND e.timestamp >= '${startTs}' AND e.timestamp <= '${endTs}'
          ) combined`
      } else {
        sourceQuery = `
          (
            SELECT pv.session_id, pv.page, pv.timestamp
            FROM page_views pv
            WHERE pv.website_id = '${funnel.websiteId}'
              AND pv.timestamp >= '${startTs}' AND pv.timestamp <= '${endTs}'
          ) combined`
      }

      // Build the final SELECT columns
      const selectColumns = steps
        .map((_, i) => {
          const idx = i + 1
          if (idx === 1) {
            return `COUNT(*) FILTER (WHERE step${idx}_at IS NOT NULL) as step${idx}_total`
          }
          // Each subsequent step requires previous step to have happened first
          const conditions = []
          for (let j = 1; j <= idx; j++) {
            conditions.push(`step${j}_at IS NOT NULL`)
          }
          // Ensure sequential ordering: each step must occur after the previous
          for (let j = 2; j <= idx; j++) {
            conditions.push(`step${j}_at > step${j - 1}_at`)
          }
          return `COUNT(*) FILTER (WHERE ${conditions.join(" AND ")}) as step${idx}_total`
        })
        .join(",\n  ")

      // Build avg time from previous step columns
      const avgTimeColumns = steps
        .map((_, i) => {
          const idx = i + 1
          if (idx === 1) return `NULL::float as step${idx}_avg_time`
          const conditions = []
          for (let j = 1; j <= idx; j++) {
            conditions.push(`step${j}_at IS NOT NULL`)
          }
          for (let j = 2; j <= idx; j++) {
            conditions.push(`step${j}_at > step${j - 1}_at`)
          }
          return `AVG(EXTRACT(EPOCH FROM (step${idx}_at - step${idx - 1}_at))) FILTER (WHERE ${conditions.join(" AND ")}) as step${idx}_avg_time`
        })
        .join(",\n  ")

      const queryText = `
        WITH step_hits AS (
          SELECT combined.session_id,
            ${stepMinColumns}
          FROM ${sourceQuery}
          GROUP BY combined.session_id
        )
        SELECT
          ${selectColumns},
          ${avgTimeColumns}
        FROM step_hits
      `

      const result = await ctx.db.execute(sql.raw(queryText))
      const row = (result as any).rows?.[0] ?? (result as any)[0] ?? {}

      // Build response array
      const response = steps.map((step, i) => {
        const idx = i + 1
        const count = Number(row[`step${idx}_total`] ?? 0)
        const prevCount = i > 0 ? Number(row[`step${i}_total`] ?? 0) : count
        const dropoff = i === 0 ? 0 : prevCount > 0 ? Math.round(((prevCount - count) / prevCount) * 10000) / 100 : 0
        const avgTimeFromPrevious = row[`step${idx}_avg_time`] != null ? Math.round(Number(row[`step${idx}_avg_time`])) : null

        return {
          stepOrder: step.stepOrder,
          name: step.name,
          count,
          dropoff,
          avgTimeFromPrevious,
        }
      })

      return response
    }),
})

function buildMatchExpr(column: string, targetValue: string, targetMatch: string): string {
  const escaped = targetValue.replace(/'/g, "''")
  switch (targetMatch) {
    case "contains":
      return `${column} LIKE '%${escaped}%'`
    case "regex":
      return `${column} ~ '${escaped}'`
    case "exact":
    default:
      return `${column} = '${escaped}'`
  }
}
