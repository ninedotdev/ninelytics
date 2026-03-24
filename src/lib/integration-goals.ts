/**
 * Evaluate REVENUE and SEARCH goals against synced integration data.
 * Called after Stripe or Search Console sync.
 */

import { and, eq, sql } from "drizzle-orm"
import { goals, conversions, searchConsoleData, stripeData } from "@/server/db/schema"

type DB = typeof import("@/server/db/client").db

export async function checkIntegrationGoals(db: DB, websiteId: string) {
  const activeGoals = await db
    .select()
    .from(goals)
    .where(and(
      eq(goals.websiteId, websiteId),
      eq(goals.isActive, true),
      sql`${goals.type} IN ('REVENUE', 'SEARCH_POSITION', 'SEARCH_CLICKS')`
    ))

  if (activeGoals.length === 0) return { checked: 0, created: 0 }

  const today = new Date().toISOString().slice(0, 10)
  let created = 0

  for (const goal of activeGoals) {
    let shouldConvert = false
    let conversionValue: number | null = null

    switch (goal.type) {
      case "REVENUE": {
        const targetCents = parseInt(goal.targetValue, 10)
        if (isNaN(targetCents)) break

        const [result] = await db
          .select({ total: sql<number>`coalesce(sum(${stripeData.revenue}), 0)` })
          .from(stripeData)
          .where(and(eq(stripeData.websiteId, websiteId), sql`${stripeData.recordDate} = ${today}`))

        const dailyRevenue = Number(result?.total ?? 0)
        if (dailyRevenue >= targetCents) {
          shouldConvert = true
          conversionValue = dailyRevenue / 100
        }
        break
      }

      case "SEARCH_POSITION": {
        const maxPosition = parseFloat(goal.targetValue)
        const query = goal.targetQuery
        if (isNaN(maxPosition) || !query) break

        const last7 = new Date()
        last7.setDate(last7.getDate() - 7)

        const [result] = await db
          .select({ avgPos: sql<number>`coalesce(avg(${searchConsoleData.position}::numeric), 999)` })
          .from(searchConsoleData)
          .where(and(
            eq(searchConsoleData.websiteId, websiteId),
            sql`${searchConsoleData.query} ILIKE ${query}`,
            sql`${searchConsoleData.recordDate} >= ${last7.toISOString().slice(0, 10)}`
          ))

        const avgPos = Number(result?.avgPos ?? 999)
        if (avgPos <= maxPosition) {
          shouldConvert = true
          conversionValue = avgPos
        }
        break
      }

      case "SEARCH_CLICKS": {
        const minClicks = parseInt(goal.targetValue, 10)
        const query = goal.targetQuery
        if (isNaN(minClicks) || !query) break

        const last30 = new Date()
        last30.setDate(last30.getDate() - 30)

        const [result] = await db
          .select({ total: sql<number>`coalesce(sum(${searchConsoleData.clicks}), 0)` })
          .from(searchConsoleData)
          .where(and(
            eq(searchConsoleData.websiteId, websiteId),
            sql`${searchConsoleData.query} ILIKE ${query}`,
            sql`${searchConsoleData.recordDate} >= ${last30.toISOString().slice(0, 10)}`
          ))

        const totalClicks = Number(result?.total ?? 0)
        if (totalClicks >= minClicks) {
          shouldConvert = true
          conversionValue = totalClicks
        }
        break
      }
    }

    if (!shouldConvert) continue

    // Dedupe: one conversion per goal per day
    const existing = await db
      .select({ id: conversions.id })
      .from(conversions)
      .where(and(
        eq(conversions.goalId, goal.id),
        sql`DATE(${conversions.timestamp}) = ${today}`
      ))
      .limit(1)

    if (existing.length > 0) continue

    await db.insert(conversions).values({
      goalId: goal.id,
      websiteId,
      visitorId: "system",
      sessionId: "integration-check",
      value: conversionValue != null ? String(conversionValue) : null,
      metadata: { source: goal.type, checkedAt: new Date().toISOString() },
      timestamp: new Date().toISOString(),
    })

    created++
  }

  return { checked: activeGoals.length, created }
}
