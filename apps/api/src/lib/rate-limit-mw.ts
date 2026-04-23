import type { MiddlewareHandler } from 'hono'
import { checkRateLimit, type RateLimitConfig } from '@ninelytics/shared/rate-limiter'
import { getClientIp } from '@ninelytics/shared/get-client-ip'

/**
 * Hono middleware that applies a RateLimitConfig. On breach returns 429
 * with Retry-After. On pass, attaches X-RateLimit-* headers.
 */
export function rateLimit(config: RateLimitConfig): MiddlewareHandler {
  return async (c, next) => {
    const ip = getClientIp(c.req.raw.headers)
    const key = config.keyGenerator
      ? config.keyGenerator(c.req.raw.headers, ip)
      : `anon:${ip}`

    let allowed = true
    let remaining = config.maxRequests
    let resetTime = Date.now() + config.windowMs
    try {
      const r = await checkRateLimit(key, config)
      allowed = r.allowed
      remaining = r.remaining
      resetTime = r.resetTime
    } catch (err) {
      // Fail-open: if Redis is down we prefer accepting traffic over
      // 500-ing the whole ingest path. Log and continue.
      console.warn('[rate-limit] Redis unavailable, allowing request:', (err as Error).message)
    }

    c.header('X-RateLimit-Limit', String(config.maxRequests))
    c.header('X-RateLimit-Remaining', String(remaining))
    c.header('X-RateLimit-Reset', String(resetTime))

    if (!allowed) {
      const retryAfter = Math.max(1, Math.ceil((resetTime - Date.now()) / 1000))
      c.header('Retry-After', String(retryAfter))
      return c.json({ error: 'Rate limit exceeded', retryAfter }, 429)
    }

    await next()
  }
}
