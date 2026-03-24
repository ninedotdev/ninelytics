import { NextRequest, NextResponse } from "next/server"
import { validateApiKey } from "@/lib/api-key-auth"
import { db } from "@/server/db/client"
import { websites, pageViews } from "@/server/db/schema"
import { eq, and, sql, desc, gte, lte, count } from "drizzle-orm"

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await validateApiKey(request)
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const { id } = await params
  if (auth.websiteId && auth.websiteId !== id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  }

  const [website] = await db.select({ id: websites.id }).from(websites).where(and(eq(websites.id, id), eq(websites.ownerId, auth.userId))).limit(1)
  if (!website) return NextResponse.json({ error: "Not found" }, { status: 404 })

  const url = new URL(request.url)
  const startDate = url.searchParams.get("startDate") || new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
  const endDate = url.searchParams.get("endDate") || new Date().toISOString().slice(0, 10)
  const start = new Date(startDate + "T00:00:00Z").toISOString()
  const end = new Date(endDate + "T23:59:59Z").toISOString()

  const result = await db
    .select({
      page: pageViews.page,
      views: count(),
      uniqueVisitors: sql<number>`count(distinct ${pageViews.visitorId})`,
    })
    .from(pageViews)
    .where(and(eq(pageViews.websiteId, id), gte(pageViews.timestamp, start), lte(pageViews.timestamp, end)))
    .groupBy(pageViews.page)
    .orderBy(desc(count()))
    .limit(20)

  return NextResponse.json({ data: result })
}
