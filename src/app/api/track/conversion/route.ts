import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/server/db/client'
import { websites, goals, conversions, pageViews, events, visitorSessions } from '@/server/db/schema'
import { eq, and, sql } from 'drizzle-orm'
import { notifyGoalAchieved } from '@/lib/notification-generator'
import { isBotRequest } from '@/lib/bot-detection'
import { isIpBlocked } from '@/lib/ip-filter'
import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limiter'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 200, headers: corsHeaders })
}

export async function POST(request: NextRequest) {
  try {
    // Bot detection
    if (isBotRequest(request.headers.get('user-agent'))) {
      return NextResponse.json(null, { status: 404, headers: corsHeaders })
    }

    // IP blocking
    const clientIp = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || request.headers.get('x-real-ip') || 'unknown'
    if (isIpBlocked(clientIp)) {
      return NextResponse.json(null, { status: 404, headers: corsHeaders })
    }

    // Rate limiting
    const rateLimitKey = RATE_LIMITS.track.keyGenerator(request)
    const { allowed, remaining, resetTime } = await checkRateLimit(rateLimitKey, RATE_LIMITS.track)
    if (!allowed) {
      const retryAfter = Math.ceil((resetTime - Date.now()) / 1000)
      return NextResponse.json(
        { error: 'Rate limit exceeded' },
        { status: 429, headers: { ...corsHeaders, 'Retry-After': retryAfter.toString() } }
      )
    }

    const body = await request.json()

    const {
      trackingCode,
      visitorId,
      sessionId,
      page,
      eventName,
      duration,
      value,
      metadata
    } = body

    if (!trackingCode || !visitorId || !sessionId) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400, headers: corsHeaders }
      )
    }

    const websiteRows = await db
      .select({ id: websites.id })
      .from(websites)
      .where(and(eq(websites.trackingCode, trackingCode), eq(websites.status, 'ACTIVE')))
      .limit(1)

    if (websiteRows.length === 0) {
      return NextResponse.json(
        { error: 'Website not found' },
        { status: 404, headers: corsHeaders }
      )
    }

    const websiteId = websiteRows[0].id

    const goalsRows = await db
      .select()
      .from(goals)
      .where(and(eq(goals.websiteId, websiteId), eq(goals.isActive, true)))

    const conversionsToCreate = []

    for (const goal of goalsRows) {
      let matchesTarget = false

      switch (goal.type) {
        case 'PAGEVIEW':
          matchesTarget = page && page === goal.targetValue
          break
        case 'EVENT':
          matchesTarget = eventName && eventName === goal.targetValue
          break
        case 'DURATION':
          const targetDuration = parseInt(goal.targetValue)
          matchesTarget = duration && duration >= targetDuration
          break
      }

      if (!matchesTarget) continue

      let shouldConvert = false
      let occurrenceCount = 0

      switch (goal.targetUnit) {
        case 'PER_SESSION':
          if (goal.type === 'PAGEVIEW') {
            const pvCount = await db
              .select({ count: sql<number>`count(*)` })
              .from(pageViews)
              .where(and(
                eq(pageViews.sessionId, sessionId),
                eq(pageViews.page, goal.targetValue)
              ))
            occurrenceCount = Number(pvCount[0]?.count ?? 0)
          } else if (goal.type === 'EVENT') {
            const evCount = await db
              .select({ count: sql<number>`count(*)` })
              .from(events)
              .where(and(
                eq(events.sessionId, sessionId),
                eq(events.eventName, goal.targetValue)
              ))
            occurrenceCount = Number(evCount[0]?.count ?? 0)
          } else if (goal.type === 'DURATION') {
            occurrenceCount = 1
          }

          if (occurrenceCount >= goal.threshold) {
            const existing = await db
              .select({ id: conversions.id })
              .from(conversions)
              .where(and(
                eq(conversions.goalId, goal.id),
                eq(conversions.sessionId, sessionId)
              ))
              .limit(1)
            shouldConvert = existing.length === 0
          }
          break

        case 'PER_VISITOR':
          if (goal.type === 'PAGEVIEW') {
            const pvCount = await db
              .select({ count: sql<number>`count(*)` })
              .from(pageViews)
              .where(and(
                eq(pageViews.visitorId, visitorId),
                eq(pageViews.page, goal.targetValue)
              ))
            occurrenceCount = Number(pvCount[0]?.count ?? 0)
          } else if (goal.type === 'EVENT') {
            const evCount = await db
              .select({ count: sql<number>`count(*)` })
              .from(events)
              .where(and(
                eq(events.visitorId, visitorId),
                eq(events.eventName, goal.targetValue)
              ))
            occurrenceCount = Number(evCount[0]?.count ?? 0)
          } else if (goal.type === 'DURATION') {
            const sessions = await db
              .select({ id: visitorSessions.id })
              .from(visitorSessions)
              .where(and(
                eq(visitorSessions.visitorId, visitorId),
                sql`${visitorSessions.duration} >= ${parseInt(goal.targetValue)}`
              ))
            occurrenceCount = sessions.length
          }

          if (occurrenceCount >= goal.threshold) {
            const existing = await db
              .select({ id: conversions.id })
              .from(conversions)
              .where(and(
                eq(conversions.goalId, goal.id),
                eq(conversions.visitorId, visitorId)
              ))
              .limit(1)
            shouldConvert = existing.length === 0
          }
          break

        case 'TOTAL':
          if (goal.type === 'PAGEVIEW') {
            const pvCount = await db
              .select({ count: sql<number>`count(*)` })
              .from(pageViews)
              .where(and(
                eq(pageViews.websiteId, websiteId),
                eq(pageViews.page, goal.targetValue)
              ))
            occurrenceCount = Number(pvCount[0]?.count ?? 0)
          } else if (goal.type === 'EVENT') {
            const evCount = await db
              .select({ count: sql<number>`count(*)` })
              .from(events)
              .where(and(
                eq(events.websiteId, websiteId),
                eq(events.eventName, goal.targetValue)
              ))
            occurrenceCount = Number(evCount[0]?.count ?? 0)
          } else if (goal.type === 'DURATION') {
            const sessions = await db
              .select({ id: visitorSessions.id })
              .from(visitorSessions)
              .where(and(
                eq(visitorSessions.websiteId, websiteId),
                sql`${visitorSessions.duration} >= ${parseInt(goal.targetValue)}`
              ))
            occurrenceCount = sessions.length
          }

          if (occurrenceCount >= goal.threshold) {
            const existing = await db
              .select({ id: conversions.id })
              .from(conversions)
              .where(and(
                eq(conversions.goalId, goal.id),
                eq(conversions.sessionId, sessionId)
              ))
              .limit(1)
            shouldConvert = existing.length === 0
          }
          break
      }

      if (shouldConvert) {
        conversionsToCreate.push({
          goalId: goal.id,
          goalName: goal.name,
          websiteId,
          visitorId,
          sessionId,
          value: value ? parseFloat(String(value)) : null,
          metadata: metadata || {},
        })
      }
    }

    if (conversionsToCreate.length > 0) {
      for (const conversion of conversionsToCreate) {
        await db.insert(conversions).values({
          goalId: conversion.goalId,
          websiteId: conversion.websiteId,
          visitorId: conversion.visitorId,
          sessionId: conversion.sessionId,
          value: conversion.value ? String(conversion.value) : null,
          metadata: conversion.metadata,
          timestamp: new Date().toISOString(),
        })

        await notifyGoalAchieved(conversion.goalId)
      }
    }

    return NextResponse.json(
      {
        success: true,
        conversions: conversionsToCreate.length,
      },
      { headers: corsHeaders }
    )
  } catch (error) {
    console.error('Error tracking conversion:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: corsHeaders }
    )
  }
}
