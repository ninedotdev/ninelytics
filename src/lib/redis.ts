import Redis from 'ioredis'

// This client works with both Redis and Dragonfly
// Dragonfly is drop-in compatible with Redis protocol
// For Dragonfly: use same connection string but point to Dragonfly server
// Dragonfly offers 25x performance over Redis with same API

const getRedisUrl = () => {
  // Priority order:
  // 1. REDIS_URL (for Redis)
  // 2. DRAGONFLY_URL (for Dragonfly)
  // 3. Default local Redis/Dragonfly
  return (
    process.env.REDIS_URL ||
    process.env.DRAGONFLY_URL ||
    'redis://localhost:6379'
  )
}

// Create Redis client
export const redis = new Redis(getRedisUrl(), {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: true,
})

// Connection health flag — tracking routes skip Redis calls when disconnected
export let isRedisConnected = false

// Connection event handlers
redis.on('connect', () => {
  console.log('Redis connected')
})

redis.on('ready', () => {
  isRedisConnected = true
})

redis.on('error', (err) => {
  if (isRedisConnected) {
    console.warn('Redis connection lost:', err.message)
  }
  isRedisConnected = false
})

redis.on('close', () => {
  isRedisConnected = false
})

// Connect to Redis
redis.connect().catch((err) => {
  console.error('Failed to connect to Redis:', err.message)
  isRedisConnected = false
})

// Real-time analytics keys
export const REALTIME_KEYS = {
  // Active visitors: Set with 5-minute TTL
  activeVisitors: (websiteId: string) => `realtime:${websiteId}:active_visitors`,
  
  // Visitor details: Hash with visitor info
  visitorDetails: (websiteId: string, visitorId: string) => 
    `realtime:${websiteId}:visitor:${visitorId}`,
  
  // Active pages: Sorted set with timestamp scores
  activePages: (websiteId: string) => `realtime:${websiteId}:active_pages`,
  
  // Live events: List (FIFO) with max 100 events
  liveEvents: (websiteId: string) => `realtime:${websiteId}:live_events`,
  
  // Geographic data: Hash with country counts
  geoData: (websiteId: string) => `realtime:${websiteId}:geo`,
  
  // Real-time stats: Hash
  stats: (websiteId: string) => `realtime:${websiteId}:stats`,
}

// Helper functions for real-time tracking
export const realtimeHelpers = {
  // Mark visitor as active
  async markVisitorActive(websiteId: string, visitorId: string, data: {
    page: string
    country?: string
    city?: string
    device?: string
    browser?: string
  }) {
    const pipeline = redis.pipeline()
    const now = Date.now()
    const ttl = 5 * 60 // 5 minutes
    
    // Add to active visitors set
    pipeline.zadd(REALTIME_KEYS.activeVisitors(websiteId), now, visitorId)
    pipeline.expire(REALTIME_KEYS.activeVisitors(websiteId), ttl)
    
    // Store visitor details
    pipeline.hmset(REALTIME_KEYS.visitorDetails(websiteId, visitorId), {
      page: data.page,
      country: data.country || 'Unknown',
      city: data.city || 'Unknown',
      device: data.device || 'Unknown',
      browser: data.browser || 'Unknown',
      lastSeen: now,
    })
    pipeline.expire(REALTIME_KEYS.visitorDetails(websiteId, visitorId), ttl)
    
    // Track active page
    pipeline.zincrby(REALTIME_KEYS.activePages(websiteId), 1, data.page)
    pipeline.expire(REALTIME_KEYS.activePages(websiteId), ttl)
    
    // Update geo data
    if (data.country && data.country !== 'Unknown') {
      pipeline.hincrby(REALTIME_KEYS.geoData(websiteId), data.country, 1)
      pipeline.expire(REALTIME_KEYS.geoData(websiteId), ttl)
    }
    
    await pipeline.exec()
  },

  // Add live event
  async addLiveEvent(websiteId: string, event: {
    type: string
    name: string
    page: string
    visitorId: string
    timestamp: number
    properties?: Record<string, unknown>
  }) {
    const eventData = JSON.stringify(event)
    const pipeline = redis.pipeline()
    
    // Add to live events list (keep last 100)
    pipeline.lpush(REALTIME_KEYS.liveEvents(websiteId), eventData)
    pipeline.ltrim(REALTIME_KEYS.liveEvents(websiteId), 0, 99)
    pipeline.expire(REALTIME_KEYS.liveEvents(websiteId), 60 * 60) // 1 hour
    
    await pipeline.exec()
  },

  // Get active visitor count
  async getActiveVisitorCount(websiteId: string): Promise<number> {
    const now = Date.now()
    const fiveMinutesAgo = now - (5 * 60 * 1000)
    
    // Remove stale visitors
    await redis.zremrangebyscore(
      REALTIME_KEYS.activeVisitors(websiteId),
      0,
      fiveMinutesAgo
    )
    
    // Count active visitors
    return await redis.zcard(REALTIME_KEYS.activeVisitors(websiteId))
  },

  // Get active visitors with details
  async getActiveVisitors(websiteId: string) {
    const now = Date.now()
    const fiveMinutesAgo = now - (5 * 60 * 1000)
    
    // Get active visitor IDs
    const visitorIds = await redis.zrangebyscore(
      REALTIME_KEYS.activeVisitors(websiteId),
      fiveMinutesAgo,
      now
    )
    
    if (visitorIds.length === 0) return []
    
    // Get visitor details in batch
    const pipeline = redis.pipeline()
    visitorIds.forEach((visitorId) => {
      pipeline.hgetall(REALTIME_KEYS.visitorDetails(websiteId, visitorId))
    })
    
    const results = await pipeline.exec()
    
    return visitorIds.map((visitorId, index) => ({
      visitorId,
      ...(results?.[index]?.[1] || {}),
    }))
  },

  // Get active pages
  async getActivePages(websiteId: string) {
    const pages = await redis.zrevrange(
      REALTIME_KEYS.activePages(websiteId),
      0,
      9, // Top 10 pages
      'WITHSCORES'
    )
    
    const result = []
    for (let i = 0; i < pages.length; i += 2) {
      result.push({
        page: pages[i],
        viewers: parseInt(pages[i + 1] || '0', 10),
      })
    }
    
    return result
  },

  // Get live events
  async getLiveEvents(websiteId: string, limit = 20) {
    const events = await redis.lrange(
      REALTIME_KEYS.liveEvents(websiteId),
      0,
      limit - 1
    )
    
    return events.map((eventStr) => {
      try {
        return JSON.parse(eventStr)
      } catch {
        return null
      }
    }).filter(Boolean)
  },

  // Get geographic data
  async getGeoData(websiteId: string) {
    const geoData = await redis.hgetall(REALTIME_KEYS.geoData(websiteId))
    
    return Object.entries(geoData).map(([country, count]) => ({
      country,
      count: parseInt(count, 10),
    }))
  },

  // Clean up old data (call periodically)
  async cleanup(websiteId: string) {
    const now = Date.now()
    const fiveMinutesAgo = now - (5 * 60 * 1000)
    
    await redis.zremrangebyscore(
      REALTIME_KEYS.activeVisitors(websiteId),
      0,
      fiveMinutesAgo
    )
  },
}

export default redis

