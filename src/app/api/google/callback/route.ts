import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { exchangeCodeForTokens } from "@/lib/google-oauth"
import { db } from "@/server/db/client"
import { users } from "@/server/db/schema"
import { eq } from "drizzle-orm"

export async function GET(request: NextRequest) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"

  try {
    const session = await getServerSession(authOptions)
    if (!session?.user?.id) {
      return NextResponse.redirect(new URL("/auth/signin", appUrl))
    }

    const { searchParams } = new URL(request.url)
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    const error = searchParams.get("error")

    if (error) {
      return NextResponse.redirect(new URL(`/settings?google=error&message=${encodeURIComponent(error)}`, appUrl))
    }

    if (!code) {
      return NextResponse.redirect(new URL("/settings?google=error&message=no_code", appUrl))
    }

    // Verify state matches session user
    if (state !== session.user.id) {
      return NextResponse.redirect(new URL("/settings?google=error&message=state_mismatch", appUrl))
    }

    // Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code)

    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString()

    // Store tokens in DB
    await db
      .update(users)
      .set({
        googleAccessToken: tokens.access_token,
        googleRefreshToken: tokens.refresh_token,
        googleTokenExpiresAt: expiresAt,
        googleScopes: tokens.scope,
      })
      .where(eq(users.id, session.user.id))

    return NextResponse.redirect(new URL("/settings?google=connected", appUrl))
  } catch (err) {
    console.error("Google OAuth callback error:", err)
    return NextResponse.redirect(new URL("/settings?google=error&message=callback_failed", appUrl))
  }
}
