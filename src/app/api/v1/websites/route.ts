import { NextRequest, NextResponse } from "next/server"
import { validateApiKey } from "@/lib/api-key-auth"
import { db } from "@/server/db/client"
import { websites } from "@/server/db/schema"
import { eq } from "drizzle-orm"

export async function GET(request: NextRequest) {
  const auth = await validateApiKey(request)
  if (!auth) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const result = await db
    .select({
      id: websites.id,
      name: websites.name,
      url: websites.url,
      status: websites.status,
      createdAt: websites.createdAt,
    })
    .from(websites)
    .where(eq(websites.ownerId, auth.userId))

  return NextResponse.json({ data: result })
}
