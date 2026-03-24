import { eq } from "drizzle-orm"
import { users } from "@/server/db/schema"
import type { DB } from "@/server/db/client"

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke"

const SCOPES = [
  "https://www.googleapis.com/auth/analytics.readonly",
  "https://www.googleapis.com/auth/webmasters.readonly",
  "https://www.googleapis.com/auth/indexing",
].join(" ")

function getClientId(): string {
  const id = process.env.GOOGLE_API_CLIENT_ID
  if (!id) throw new Error("GOOGLE_API_CLIENT_ID is not configured")
  return id
}

function getClientSecret(): string {
  const secret = process.env.GOOGLE_API_CLIENT_SECRET
  if (!secret) throw new Error("GOOGLE_API_CLIENT_SECRET is not configured")
  return secret
}

function getRedirectUri(): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  return `${appUrl}/api/google/callback`
}

/**
 * Build the Google OAuth authorization URL.
 * The userId is passed as `state` to link the callback to the correct user.
 */
export function getGoogleAuthUrl(userId: string): string {
  const params = new URLSearchParams({
    client_id: getClientId(),
    redirect_uri: getRedirectUri(),
    response_type: "code",
    scope: SCOPES,
    access_type: "offline",
    prompt: "consent",
    state: userId,
  })
  return `${GOOGLE_AUTH_URL}?${params.toString()}`
}

/**
 * Exchange an authorization code for access + refresh tokens.
 */
export async function exchangeCodeForTokens(code: string): Promise<{
  access_token: string
  refresh_token: string
  expires_in: number
  scope: string
}> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: getClientId(),
      client_secret: getClientSecret(),
      redirect_uri: getRedirectUri(),
      grant_type: "authorization_code",
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to exchange code: ${error}`)
  }

  return response.json()
}

/**
 * Refresh an expired access token using a refresh token.
 */
export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string
  expires_in: number
}> {
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: getClientId(),
      client_secret: getClientSecret(),
      grant_type: "refresh_token",
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to refresh token: ${error}`)
  }

  return response.json()
}

/**
 * Get a valid access token for a user. Auto-refreshes if expired.
 */
export async function getValidAccessToken(
  userId: string,
  db: DB
): Promise<string | null> {
  const [user] = await db
    .select({
      googleAccessToken: users.googleAccessToken,
      googleRefreshToken: users.googleRefreshToken,
      googleTokenExpiresAt: users.googleTokenExpiresAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!user?.googleAccessToken || !user?.googleRefreshToken) {
    return null
  }

  // Check if token is still valid (with 5 minute buffer)
  const expiresAt = user.googleTokenExpiresAt ? new Date(user.googleTokenExpiresAt) : new Date(0)
  const isExpired = expiresAt.getTime() - 5 * 60 * 1000 < Date.now()

  if (!isExpired) {
    return user.googleAccessToken
  }

  // Refresh the token
  const refreshed = await refreshAccessToken(user.googleRefreshToken)

  const newExpiresAt = new Date(Date.now() + refreshed.expires_in * 1000).toISOString()

  await db
    .update(users)
    .set({
      googleAccessToken: refreshed.access_token,
      googleTokenExpiresAt: newExpiresAt,
    })
    .where(eq(users.id, userId))

  return refreshed.access_token
}

/**
 * Revoke Google OAuth tokens.
 */
export async function revokeGoogleTokens(token: string): Promise<void> {
  try {
    await fetch(`${GOOGLE_REVOKE_URL}?token=${token}`, { method: "POST" })
  } catch {
    // Revocation is best-effort
  }
}
