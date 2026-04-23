/**
 * JWT sign/verify using HS256 + NEXTAUTH_SECRET.
 *
 * We keep the same env var as NextAuth for continuity — users configured
 * NEXTAUTH_SECRET in Coolify already. JWT_SECRET wins if both are set so
 * we can rotate independently later.
 */
import { SignJWT, jwtVerify } from 'jose'

const SECRET_ENV = process.env.JWT_SECRET ?? process.env.NEXTAUTH_SECRET
if (!SECRET_ENV) {
  // Not a hard throw at import — the db fallback pattern is to fail lazily.
  console.warn('[auth] neither JWT_SECRET nor NEXTAUTH_SECRET is set')
}

function getSecret(): Uint8Array {
  const s = process.env.JWT_SECRET ?? process.env.NEXTAUTH_SECRET
  if (!s) throw new Error('JWT_SECRET / NEXTAUTH_SECRET is not set')
  return new TextEncoder().encode(s)
}

export interface SessionClaims {
  sub: string
  email: string
  role: 'ADMIN' | 'OWNER' | 'VIEWER'
  isSuperAdmin: boolean
}

const DEFAULT_EXPIRY = '30d'

export async function signSessionToken(
  claims: SessionClaims,
  expiresIn: string = DEFAULT_EXPIRY,
): Promise<string> {
  return await new SignJWT(claims as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(getSecret())
}

export async function verifySessionToken(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret(), { algorithms: ['HS256'] })
    if (
      typeof payload.sub !== 'string' ||
      typeof payload.email !== 'string' ||
      typeof payload.role !== 'string' ||
      typeof payload.isSuperAdmin !== 'boolean'
    ) {
      return null
    }
    return {
      sub: payload.sub,
      email: payload.email,
      role: payload.role as SessionClaims['role'],
      isSuperAdmin: payload.isSuperAdmin,
    }
  } catch {
    return null
  }
}
