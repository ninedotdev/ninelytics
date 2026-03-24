// Rate Limiting Middleware — backed by Redis for distributed environments
import { NextRequest, NextResponse } from 'next/server'
import { redis } from '@/lib/redis'

interface RateLimitConfig {
  windowMs: number // Time window in milliseconds
  maxRequests: number // Maximum requests per window
  keyGenerator?: (req: NextRequest) => string // Custom key generator
}

export async function checkRateLimit(
  key: string,
  config: RateLimitConfig
): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
  const windowSec = Math.ceil(config.windowMs / 1000)
  const redisKey = `rl:${key}`

  const count = await redis.incr(redisKey)

  if (count === 1) {
    // First request in this window — set expiry
    await redis.expire(redisKey, windowSec)
  }

  const ttl = await redis.ttl(redisKey)
  const resetTime = Date.now() + ttl * 1000
  const remaining = Math.max(0, config.maxRequests - count)

  return {
    allowed: count <= config.maxRequests,
    remaining,
    resetTime,
  }
}

// Rate limit configurations
export const RATE_LIMITS = {
  // Analytics endpoints: 60 requests/minute per user
  analytics: {
    windowMs: 60 * 1000,
    maxRequests: 60,
    keyGenerator: (req: NextRequest) => {
      const session = req.headers.get('authorization') || 'anonymous'
      return `analytics:${session}`
    },
  },

  // AI endpoints: 20 requests/minute per user
  ai: {
    windowMs: 60 * 1000,
    maxRequests: 20,
    keyGenerator: (req: NextRequest) => {
      const session = req.headers.get('authorization') || 'anonymous'
      return `ai:${session}`
    },
  },

  // Track endpoints: 1000 requests/minute per IP
  track: {
    windowMs: 60 * 1000,
    maxRequests: 1000,
    keyGenerator: (req: NextRequest) => {
      const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
        || req.headers.get('x-real-ip')
        || 'unknown'
      return `track:${ip}`
    },
  },

  // General API: 100 requests/minute per user
  general: {
    windowMs: 60 * 1000,
    maxRequests: 100,
    keyGenerator: (req: NextRequest) => {
      const session = req.headers.get('authorization') || 'anonymous'
      return `general:${session}`
    },
  },
}

// Rate limiting middleware
export function withRateLimit(config: RateLimitConfig) {
  return (handler: (req: NextRequest) => Promise<NextResponse>) => {
    return async (req: NextRequest): Promise<NextResponse> => {
      const key = config.keyGenerator ? config.keyGenerator(req) : 'unknown'

      const { allowed, remaining, resetTime } = await checkRateLimit(key, config)

      if (!allowed) {
        const retryAfter = Math.ceil((resetTime - Date.now()) / 1000)
        return NextResponse.json(
          {
            error: 'Rate limit exceeded',
            message: `Too many requests. Try again in ${retryAfter} seconds.`,
            retryAfter,
            remaining,
          },
          {
            status: 429,
            headers: {
              'Retry-After': retryAfter.toString(),
              'X-RateLimit-Limit': config.maxRequests.toString(),
              'X-RateLimit-Remaining': remaining.toString(),
              'X-RateLimit-Reset': resetTime.toString(),
            },
          }
        )
      }

      const response = await handler(req)
      response.headers.set('X-RateLimit-Limit', config.maxRequests.toString())
      response.headers.set('X-RateLimit-Remaining', remaining.toString())
      response.headers.set('X-RateLimit-Reset', resetTime.toString())

      return response
    }
  }
}
