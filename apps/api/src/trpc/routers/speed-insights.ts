import { z } from "zod"
import { and, eq, gte, sql } from "drizzle-orm"
import { websites, webVitals } from "@ninelytics/db/schema"
import { protectedProcedure, router } from "../trpc"
import { ensureAccess } from "./helpers/ensure-access"

const VITAL_WEIGHTS: Record<string, number> = {
  LCP: 0.35,
  INP: 0.30,
  FCP: 0.15,
  CLS: 0.15,
  TTFB: 0.05,
}

type VitalRow = {
  name: string
  p75: number
  goodPct: number
  poorPct?: number
  count: number
}

function calculateRES(vitals: VitalRow[]): number {
  let score = 0
  let totalWeight = 0
  for (const v of vitals) {
    const weight = VITAL_WEIGHTS[v.name] ?? 0
    score += (v.goodPct / 100) * weight * 100
    totalWeight += weight
  }
  return totalWeight > 0 ? Math.round(score / totalWeight) : 0
}

function getPeriodStart(period: "24h" | "7d" | "30d"): Date {
  const now = new Date()
  if (period === "24h") return new Date(now.getTime() - 24 * 60 * 60 * 1000)
  if (period === "7d") return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000)
  return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)
}

export const speedInsightsRouter = router({
  // Enable or disable Speed Insights for a website
  toggle: protectedProcedure
    .input(z.object({ websiteId: z.string(), enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await ensureAccess(ctx.db, input.websiteId, ctx.session!.user.id, true)
      await ctx.db
        .update(websites)
        .set({ speedInsightsEnabled: input.enabled })
        .where(eq(websites.id, input.websiteId))
      return { success: true }
    }),

  // Get current enabled state
  getStatus: protectedProcedure
    .input(z.object({ websiteId: z.string() }))
    .query(async ({ ctx, input }) => {
      await ensureAccess(ctx.db, input.websiteId, ctx.session!.user.id, false)
      const [website] = await ctx.db
        .select({ speedInsightsEnabled: websites.speedInsightsEnabled })
        .from(websites)
        .where(eq(websites.id, input.websiteId))
        .limit(1)
      return { enabled: website?.speedInsightsEnabled ?? false }
    }),

  // Per-vital p75, goodPct, count + overall Real Experience Score
  getSummary: protectedProcedure
    .input(z.object({
      websiteId: z.string(),
      period: z.enum(["24h", "7d", "30d"]).default("7d"),
      deviceType: z.enum(["all", "mobile", "tablet", "desktop"]).default("all"),
    }))
    .query(async ({ ctx, input }) => {
      await ensureAccess(ctx.db, input.websiteId, ctx.session!.user.id, false)

      const since = getPeriodStart(input.period)

      const rows = await ctx.db.execute<{
        name: string
        p75: string
        p50: string
        good_pct: string
        poor_pct: string
        count: string
      }>(sql`
        SELECT
          name,
          percentile_cont(0.75) WITHIN GROUP (ORDER BY value) AS p75,
          percentile_cont(0.50) WITHIN GROUP (ORDER BY value) AS p50,
          ROUND(100.0 * SUM(CASE WHEN rating = 'good' THEN 1 ELSE 0 END) / COUNT(*), 1) AS good_pct,
          ROUND(100.0 * SUM(CASE WHEN rating = 'poor' THEN 1 ELSE 0 END) / COUNT(*), 1) AS poor_pct,
          COUNT(*) AS count
        FROM web_vitals
        WHERE website_id = ${input.websiteId}
          AND recorded_at >= ${since.toISOString()}
          ${input.deviceType !== "all" ? sql`AND device_type = ${input.deviceType}` : sql``}
        GROUP BY name
      `)

      const vitals = (rows as unknown as Array<{ name: string; p75: string; p50: string; good_pct: string; poor_pct: string; count: string }>)
        .map((r) => ({
          name: r.name,
          p75: Math.round(Number(r.p75)),
          p50: Math.round(Number(r.p50)),
          goodPct: Number(r.good_pct),
          poorPct: Number(r.poor_pct),
          count: Number(r.count),
        }))

      const res = calculateRES(vitals)
      return { vitals, res }
    }),

  // Daily p75 time series for a single vital
  getTimeSeries: protectedProcedure
    .input(z.object({
      websiteId: z.string(),
      vitalName: z.enum(["LCP", "FCP", "INP", "CLS", "TTFB"]),
      period: z.enum(["24h", "7d", "30d"]).default("7d"),
    }))
    .query(async ({ ctx, input }) => {
      await ensureAccess(ctx.db, input.websiteId, ctx.session!.user.id, false)

      const since = getPeriodStart(input.period)

      const rows = await ctx.db.execute<{
        date: string
        p75: string
        good_pct: string
        count: string
      }>(sql`
        SELECT
          DATE_TRUNC('day', recorded_at)::date AS date,
          percentile_cont(0.75) WITHIN GROUP (ORDER BY value) AS p75,
          ROUND(100.0 * SUM(CASE WHEN rating = 'good' THEN 1 ELSE 0 END) / COUNT(*), 1) AS good_pct,
          COUNT(*) AS count
        FROM web_vitals
        WHERE website_id = ${input.websiteId}
          AND name = ${input.vitalName}
          AND recorded_at >= ${since.toISOString()}
        GROUP BY DATE_TRUNC('day', recorded_at)::date
        ORDER BY date ASC
      `)

      return (rows as unknown as Array<{ date: string; p75: string; good_pct: string; count: string }>)
        .map((r) => ({
          date: r.date,
          p75: Math.round(Number(r.p75)),
          goodPct: Number(r.good_pct),
          count: Number(r.count),
        }))
    }),

  // Top 10 worst-performing pages for a vital (min 5 samples)
  getWorstPages: protectedProcedure
    .input(z.object({
      websiteId: z.string(),
      vitalName: z.enum(["LCP", "FCP", "INP", "CLS", "TTFB"]),
      period: z.enum(["24h", "7d", "30d"]).default("7d"),
    }))
    .query(async ({ ctx, input }) => {
      await ensureAccess(ctx.db, input.websiteId, ctx.session!.user.id, false)

      const since = getPeriodStart(input.period)

      const rows = await ctx.db.execute<{
        path: string
        p75: string
        poor_pct: string
        count: string
      }>(sql`
        SELECT
          path,
          percentile_cont(0.75) WITHIN GROUP (ORDER BY value) AS p75,
          ROUND(100.0 * SUM(CASE WHEN rating = 'poor' THEN 1 ELSE 0 END) / COUNT(*), 1) AS poor_pct,
          COUNT(*) AS count
        FROM web_vitals
        WHERE website_id = ${input.websiteId}
          AND name = ${input.vitalName}
          AND recorded_at >= ${since.toISOString()}
        GROUP BY path
        HAVING COUNT(*) >= 5
        ORDER BY percentile_cont(0.75) WITHIN GROUP (ORDER BY value) DESC
        LIMIT 10
      `)

      return (rows as unknown as Array<{ path: string; p75: string; poor_pct: string; count: string }>)
        .map((r) => ({
          path: r.path,
          p75: Math.round(Number(r.p75)),
          poorPct: Number(r.poor_pct),
          count: Number(r.count),
        }))
    }),
})
