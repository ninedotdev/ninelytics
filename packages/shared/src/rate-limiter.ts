/**
 * Redis-backed rate limiter. Runtime-agnostic — keyGenerator receives
 * the header map and the client IP. Caller formats the 429 response
 * however they want (Hono / TanStack / anything else).
 */
import { redis } from './redis'

export interface RateLimitConfig {
  windowMs: number
  maxRequests: number
  keyGenerator?: (headers: Headers, ip: string) => string
}

export interface RateLimitResult {
  allowed: boolean
  remaining: number
  resetTime: number
}

export async function checkRateLimit(
  key: string,
  config: RateLimitConfig
): Promise<RateLimitResult> {
  const windowSec = Math.ceil(config.windowMs / 1000)
  const redisKey = `rl:${key}`

  const count = await redis.incr(redisKey)
  if (count === 1) {
    await redis.expire(redisKey, windowSec)
  }

  const ttl = await redis.ttl(redisKey)
  const resetTime = Date.now() + Math.max(ttl, 0) * 1000
  const remaining = Math.max(0, config.maxRequests - count)

  return {
    allowed: count <= config.maxRequests,
    remaining,
    resetTime,
  }
}

const authKey = (headers: Headers) => headers.get('authorization') || 'anonymous'

export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  analytics: {
    windowMs: 60_000,
    maxRequests: 60,
    keyGenerator: (h) => `analytics:${authKey(h)}`,
  },
  ai: {
    windowMs: 60_000,
    maxRequests: 20,
    keyGenerator: (h) => `ai:${authKey(h)}`,
  },
  track: {
    windowMs: 60_000,
    maxRequests: 1000,
    keyGenerator: (_h, ip) => `track:${ip}`,
  },
  general: {
    windowMs: 60_000,
    maxRequests: 100,
    keyGenerator: (h) => `general:${authKey(h)}`,
  },
}
