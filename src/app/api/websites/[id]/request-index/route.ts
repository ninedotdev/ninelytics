import { validateApiKey } from "@/lib/api-key-auth"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params

  // Support both API key (CI/CD) and session (dashboard) auth
  const apiKeyAuth = await validateApiKey(request)
  if (apiKeyAuth) {
    if (apiKeyAuth.websiteId && apiKeyAuth.websiteId !== id) {
      return new Response("Unauthorized", { status: 401 })
    }
  } else {
    const session = await getServerSession(authOptions)
    if (!session?.user) return new Response("Unauthorized", { status: 401 })
  }

  const { start } = await import("workflow/api")
  const { pollAndIndexSitemap } = await import("@/workflows/sitemap-indexing")
  await start(pollAndIndexSitemap, [id])

  return Response.json({ message: "Sitemap indexing workflow started" })
}
