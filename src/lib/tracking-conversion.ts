import { and, eq, sql } from "drizzle-orm"
import { db } from "@/server/db/client"
import { conversions, events, goals, pageViews, visitorSessions } from "@/server/db/schema"
import { notifyGoalAchieved } from "@/lib/notification-generator"
import { TRACKING_CONFIG } from "@/lib/tracking-config"
import { getActiveWebsiteByTrackingCode } from "@/lib/tracking-websites"

export interface ConversionPayload {
  trackingCode: string
  visitorId: string
  sessionId: string
  page?: string
  eventName?: string
  duration?: number
  value?: string | number | null
  metadata?: Record<string, unknown>
}

export async function processConversionPayload(payload: ConversionPayload) {
  const { trackingCode, visitorId, sessionId, page, eventName, duration, value, metadata } = payload

  const website = await getActiveWebsiteByTrackingCode(trackingCode)
  if (!website) {
    return { success: false as const, error: "Website not found" }
  }

  const websiteId = website.id
  const goalsRows = await db
    .select()
    .from(goals)
    .where(and(eq(goals.websiteId, websiteId), eq(goals.isActive, true)))

  const conversionsToCreate: Array<{
    goalId: string
    websiteId: string
    visitorId: string
    sessionId: string
    value: number | null
    metadata: Record<string, unknown>
  }> = []

  for (const goal of goalsRows) {
    let matchesTarget = false

    switch (goal.type) {
      case "PAGEVIEW":
        matchesTarget = !!page && page === goal.targetValue
        break
      case "EVENT":
        matchesTarget = !!eventName && eventName === goal.targetValue
        break
      case "DURATION":
        matchesTarget =
          duration !== undefined && duration >= Number.parseInt(goal.targetValue, 10)
        break
    }

    if (!matchesTarget) continue

    let shouldConvert = false
    let occurrenceCount = 0

    switch (goal.targetUnit) {
      case "PER_SESSION":
        if (goal.type === "PAGEVIEW") {
          const pvCount = await db
            .select({ count: sql<number>`count(*)` })
            .from(pageViews)
            .where(and(eq(pageViews.sessionId, sessionId), eq(pageViews.page, goal.targetValue)))
          occurrenceCount = Number(pvCount[0]?.count ?? 0)
        } else if (goal.type === "EVENT") {
          const evCount = await db
            .select({ count: sql<number>`count(*)` })
            .from(events)
            .where(and(eq(events.sessionId, sessionId), eq(events.eventName, goal.targetValue)))
          occurrenceCount = Number(evCount[0]?.count ?? 0)
        } else {
          occurrenceCount = 1
        }

        if (occurrenceCount >= goal.threshold) {
          const existing = await db
            .select({ id: conversions.id })
            .from(conversions)
            .where(and(eq(conversions.goalId, goal.id), eq(conversions.sessionId, sessionId)))
            .limit(1)
          shouldConvert = existing.length === 0
        }
        break

      case "PER_VISITOR":
        if (goal.type === "PAGEVIEW") {
          const pvCount = await db
            .select({ count: sql<number>`count(*)` })
            .from(pageViews)
            .where(and(eq(pageViews.visitorId, visitorId), eq(pageViews.page, goal.targetValue)))
          occurrenceCount = Number(pvCount[0]?.count ?? 0)
        } else if (goal.type === "EVENT") {
          const evCount = await db
            .select({ count: sql<number>`count(*)` })
            .from(events)
            .where(and(eq(events.visitorId, visitorId), eq(events.eventName, goal.targetValue)))
          occurrenceCount = Number(evCount[0]?.count ?? 0)
        } else {
          const sessions = await db
            .select({ id: visitorSessions.id })
            .from(visitorSessions)
            .where(
              and(
                eq(visitorSessions.visitorId, visitorId),
                sql`${visitorSessions.duration} >= ${Number.parseInt(goal.targetValue, 10)}`
              )
            )
          occurrenceCount = sessions.length
        }

        if (occurrenceCount >= goal.threshold) {
          const existing = await db
            .select({ id: conversions.id })
            .from(conversions)
            .where(and(eq(conversions.goalId, goal.id), eq(conversions.visitorId, visitorId)))
            .limit(1)
          shouldConvert = existing.length === 0
        }
        break

      case "TOTAL":
        if (goal.type === "PAGEVIEW") {
          const pvCount = await db
            .select({ count: sql<number>`count(*)` })
            .from(pageViews)
            .where(and(eq(pageViews.websiteId, websiteId), eq(pageViews.page, goal.targetValue)))
          occurrenceCount = Number(pvCount[0]?.count ?? 0)
        } else if (goal.type === "EVENT") {
          const evCount = await db
            .select({ count: sql<number>`count(*)` })
            .from(events)
            .where(and(eq(events.websiteId, websiteId), eq(events.eventName, goal.targetValue)))
          occurrenceCount = Number(evCount[0]?.count ?? 0)
        } else {
          const sessions = await db
            .select({ id: visitorSessions.id })
            .from(visitorSessions)
            .where(
              and(
                eq(visitorSessions.websiteId, websiteId),
                sql`${visitorSessions.duration} >= ${Number.parseInt(goal.targetValue, 10)}`
              )
            )
          occurrenceCount = sessions.length
        }

        if (occurrenceCount >= goal.threshold) {
          const existing = await db
            .select({ id: conversions.id })
            .from(conversions)
            .where(and(eq(conversions.goalId, goal.id), eq(conversions.sessionId, sessionId)))
            .limit(1)
          shouldConvert = existing.length === 0
        }
        break
    }

    if (shouldConvert) {
      conversionsToCreate.push({
        goalId: goal.id,
        websiteId,
        visitorId,
        sessionId,
        value: value ? Number.parseFloat(String(value)) : null,
        metadata: metadata || {},
      })
    }
  }

  if (conversionsToCreate.length > 0) {
    await db.insert(conversions).values(
      conversionsToCreate.map((conversion) => ({
        goalId: conversion.goalId,
        websiteId: conversion.websiteId,
        visitorId: conversion.visitorId,
        sessionId: conversion.sessionId,
        value: conversion.value ? String(conversion.value) : null,
        metadata: conversion.metadata,
        timestamp: new Date().toISOString(),
      }))
    )

    const notifyWork = Promise.allSettled(
      conversionsToCreate.map((conversion) => notifyGoalAchieved(conversion.goalId))
    )

    if (TRACKING_CONFIG.notifyGoalsAsync) {
      notifyWork.catch((error) => console.error("Async goal notification error:", error))
    } else {
      await notifyWork
    }
  }

  return { success: true as const, conversions: conversionsToCreate.length }
}
