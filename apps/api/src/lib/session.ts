/**
 * Session resolution: read the session cookie, verify the JWT, look up the
 * user fresh from the DB (so role/isSuperAdmin revocation takes effect on
 * next request without waiting for token expiry).
 */
import { eq } from 'drizzle-orm'
import { db } from '@ninelytics/shared/db'
import { users } from '@ninelytics/db/schema'
import { parseCookies, SESSION_COOKIE } from '@/lib/cookies'
import { verifySessionToken } from '@/lib/jwt'
import type { Session } from '@/trpc/trpc'

export async function getSession(req: Request): Promise<Session | null> {
  // Dev escape hatch for local testing without logging in.
  if (process.env.API_DEV_FAKE_SUPERADMIN === '1') {
    return {
      user: {
        id: 'dev-admin',
        email: 'dev@localhost',
        name: 'Dev',
        image: null,
        role: 'ADMIN',
        isSuperAdmin: true,
      },
    }
  }

  const cookies = parseCookies(req.headers.get('cookie'))
  const token = cookies[SESSION_COOKIE]
  if (!token) return null

  const claims = await verifySessionToken(token)
  if (!claims) return null

  // Fresh user lookup. If the user was deleted/disabled since the token
  // was issued, we return null and the middleware will UNAUTHORIZED.
  try {
    const [user] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        image: users.image,
        role: users.role,
        isSuperAdmin: users.isSuperAdmin,
      })
      .from(users)
      .where(eq(users.id, claims.sub))
      .limit(1)

    if (!user) return null
    return { user }
  } catch (err) {
    console.error('[session] lookup failed:', err)
    return null
  }
}
