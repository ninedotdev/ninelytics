import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/server/db/client'
import { websites, webVitals } from '@/server/db/schema'
import { eq, and } from 'drizzle-orm'

function corsHeaders(request: NextRequest) {
  const origin = request.headers.get('origin') ?? '*'
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  }
}

const VALID_VITALS = ['LCP', 'FCP', 'INP', 'CLS', 'TTFB'] as const

export async function OPTIONS(request: NextRequest) {
  return new NextResponse(null, { status: 200, headers: corsHeaders(request) })
}

export async function POST(request: NextRequest) {
  const headers = corsHeaders(request)
  try {
    let body: unknown
    try {
      const text = await request.text()
      body = JSON.parse(text)
    } catch {
      return new NextResponse(null, { status: 400, headers })
    }

    const { siteId, name, value, rating, path, deviceType, connectionType } = body as Record<string, unknown>

    if (!VALID_VITALS.includes(name as typeof VALID_VITALS[number])) {
      return new NextResponse(null, { status: 400, headers })
    }

    if (typeof value !== 'number' || !siteId || !path) {
      return new NextResponse(null, { status: 400, headers })
    }

    const [website] = await db
      .select({ id: websites.id, speedInsightsEnabled: websites.speedInsightsEnabled })
      .from(websites)
      .where(and(eq(websites.trackingCode, String(siteId)), eq(websites.status, 'ACTIVE')))
      .limit(1)

    if (!website?.speedInsightsEnabled) {
      return new NextResponse(null, { status: 404, headers })
    }

    // Server-side sampling: accept ~10% of vitals to prevent DB bloat
    // Deterministic based on value to avoid bias
    if (Math.round(Number(value)) % 10 !== 0) {
      return new NextResponse(null, { status: 202, headers })
    }

    await db.insert(webVitals).values({
      websiteId: website.id,
      name: String(name),
      value: Math.round(Number(value)),
      rating: String(rating ?? 'unknown'),
      path: String(path),
      deviceType: deviceType ? String(deviceType) : null,
      connectionType: connectionType ? String(connectionType) : null,
    })

    return new NextResponse(null, { status: 202, headers })
  } catch (error) {
    console.error('[vitals] Error:', error)
    return new NextResponse(null, { status: 500, headers })
  }
}
