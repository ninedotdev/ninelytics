/**
 * JWT sign/verify using HS256 + SESSION_SECRET.
 */
import { SignJWT, jwtVerify } from 'jose'

if (!process.env.SESSION_SECRET) {
  console.warn('[auth] SESSION_SECRET is not set')
}

function getSecret(): Uint8Array {
  const s = process.env.SESSION_SECRET
  if (!s) throw new Error('SESSION_SECRET is not set')
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
