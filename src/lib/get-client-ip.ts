/**
 * Extracts the real visitor IP address.
 * Priority for Cloudflare Tunnel setups:
 *   1. CF-Connecting-IP  — set by Cloudflare, always the real visitor IP
 *   2. X-Forwarded-For   — fallback (first entry)
 *   3. X-Real-IP         — fallback
 */
export function getClientIp(headers: Headers | { get: (key: string) => string | null }): string {
  return (
    headers.get('cf-connecting-ip') ||
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip') ||
    'unknown'
  )
}
