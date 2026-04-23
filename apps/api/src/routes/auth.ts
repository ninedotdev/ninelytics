/**
 * Auth endpoints. Email + password for now; OAuth (Google) lands in a
 * follow-up commit.
 *
 * - POST /api/auth/signin   body: {email, password} → sets session cookie
 * - POST /api/auth/signout  → clears cookie
 * - GET  /api/auth/session  → returns current session or 401
 */
import { Hono } from 'hono'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import { eq, sql } from 'drizzle-orm'
import { db } from '@ninelytics/shared/db'
import { users } from '@ninelytics/db/schema'
import { signSessionToken } from '@/lib/jwt'
import { sessionCookie, clearSessionCookie } from '@/lib/cookies'
import { getSession } from '@/lib/session'
import { rateLimit } from '@/lib/rate-limit-mw'
import { RATE_LIMITS } from '@ninelytics/shared/rate-limiter'

export const auth = new Hono()

const signinSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

// Login attempts are noisy — rate limit by IP.
auth.post('/signin', rateLimit(RATE_LIMITS.general!), async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }
  const parsed = signinSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'Invalid payload' }, 400)
  const { email, password } = parsed.data

  try {
    const [user] = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1)

    // Equal-time rejection so we don't leak user enumeration.
    if (!user || !user.password) {
      await bcrypt.compare(password, '$2a$10$invalidinvalidinvalidinvalidinvalid')
      return c.json({ error: 'Invalid credentials' }, 401)
    }

    const ok = await bcrypt.compare(password, user.password)
    if (!ok) return c.json({ error: 'Invalid credentials' }, 401)

    const token = await signSessionToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      isSuperAdmin: user.isSuperAdmin,
    })

    c.header('Set-Cookie', sessionCookie(token))
    return c.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        role: user.role,
        isSuperAdmin: user.isSuperAdmin,
      },
    })
  } catch (err) {
    console.error('[auth] signin error:', err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})

auth.post('/signout', (c) => {
  c.header('Set-Cookie', clearSessionCookie())
  return c.json({ success: true })
})

auth.get('/session', async (c) => {
  const session = await getSession(c.req.raw)
  if (!session) return c.json({ user: null }, 401)
  return c.json(session)
})

// Registration. Allowed when multi-tenant, OR when no users exist yet
// (first-run setup), matching the old NextAuth signIn callback logic.
const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1).max(120).optional(),
})

auth.post('/signup', rateLimit(RATE_LIMITS.general!), async (c) => {
  let body: unknown
  try {
    body = await c.req.json()
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400)
  }
  const parsed = signupSchema.safeParse(body)
  if (!parsed.success) return c.json({ error: 'Invalid payload' }, 400)
  const { email, password, name } = parsed.data

  try {
    const [existing] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email))
      .limit(1)
    if (existing) return c.json({ error: 'Email already registered' }, 409)

    const isMultiTenant = process.env.IS_MULTI_TENANT === 'true'
    if (!isMultiTenant) {
      const [{ count }] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(users)
      if (count > 0) {
        return c.json({ error: 'Registrations closed' }, 403)
      }
    }

    const hash = await bcrypt.hash(password, 10)
    const [user] = await db
      .insert(users)
      .values({ email, password: hash, name, role: 'OWNER', isSuperAdmin: false })
      .returning()
    if (!user) return c.json({ error: 'Could not create user' }, 500)

    const token = await signSessionToken({
      sub: user.id,
      email: user.email,
      role: user.role,
      isSuperAdmin: user.isSuperAdmin,
    })
    c.header('Set-Cookie', sessionCookie(token))
    return c.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        image: user.image,
        role: user.role,
        isSuperAdmin: user.isSuperAdmin,
      },
    })
  } catch (err) {
    console.error('[auth] signup error:', err)
    return c.json({ error: 'Internal server error' }, 500)
  }
})
