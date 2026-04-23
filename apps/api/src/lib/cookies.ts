/**
 * Small helper for our session cookie. httpOnly + SameSite=Lax so it works
 * across same-site subdomain redirects but not CSRF-weak.
 */
export const SESSION_COOKIE = 'ninelytics-session'

export function sessionCookie(value: string, maxAgeSec = 60 * 60 * 24 * 30): string {
  const parts = [
    `${SESSION_COOKIE}=${value}`,
    'Path=/',
    `Max-Age=${maxAgeSec}`,
    'HttpOnly',
    'SameSite=Lax',
  ]
  if (process.env.NODE_ENV === 'production') parts.push('Secure')
  return parts.join('; ')
}

export function clearSessionCookie(): string {
  const parts = [
    `${SESSION_COOKIE}=`,
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Lax',
  ]
  if (process.env.NODE_ENV === 'production') parts.push('Secure')
  return parts.join('; ')
}

export function parseCookies(header: string | null): Record<string, string> {
  if (!header) return {}
  const out: Record<string, string> = {}
  for (const chunk of header.split(';')) {
    const idx = chunk.indexOf('=')
    if (idx < 0) continue
    const k = chunk.slice(0, idx).trim()
    const v = chunk.slice(idx + 1).trim()
    if (k) out[k] = decodeURIComponent(v)
  }
  return out
}
