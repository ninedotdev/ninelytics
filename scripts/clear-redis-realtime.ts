#!/usr/bin/env tsx
/**
 * Script to clear all realtime analytics data from Redis/Dragonfly
 * This will delete all keys matching the pattern realtime:*
 */

import { redis, REALTIME_KEYS } from '@/lib/redis'

async function clearRealtimeData() {
  try {
    console.log('Connecting to Redis/Dragonfly...')
    await redis.connect()
    console.log('Connected successfully!')

    // Get all website IDs from database
    const { db } = await import('@/server/db/client')
    const { websites } = await import('@/server/db/schema')
    
    const websiteList = await db.select({ id: websites.id }).from(websites)
    console.log(`Found ${websiteList.length} websites`)

    // Clear realtime data for each website
    for (const website of websiteList) {
      const websiteId = website.id
      console.log(`Clearing realtime data for website: ${websiteId}`)
      
      const pipeline = redis.pipeline()
      
      // Delete all realtime keys for this website
      pipeline.del(REALTIME_KEYS.activeVisitors(websiteId))
      pipeline.del(REALTIME_KEYS.activePages(websiteId))
      pipeline.del(REALTIME_KEYS.liveEvents(websiteId))
      pipeline.del(REALTIME_KEYS.geoData(websiteId))
      pipeline.del(REALTIME_KEYS.stats(websiteId))
      
      // Delete all visitor detail keys (we need to find them first)
      const visitorKeys = await redis.keys(`realtime:${websiteId}:visitor:*`)
      if (visitorKeys.length > 0) {
        pipeline.del(...visitorKeys)
      }
      
      await pipeline.exec()
      console.log(`  ✓ Cleared realtime data for website ${websiteId}`)
    }

    // Also clear any orphaned realtime keys
    console.log('Clearing orphaned realtime keys...')
    const allRealtimeKeys = await redis.keys('realtime:*')
    if (allRealtimeKeys.length > 0) {
      await redis.del(...allRealtimeKeys)
      console.log(`  ✓ Deleted ${allRealtimeKeys.length} orphaned keys`)
    } else {
      console.log('  ✓ No orphaned keys found')
    }

    console.log('\n✅ All realtime data cleared successfully!')
  } catch (error) {
    console.error('❌ Error clearing realtime data:', error)
    process.exit(1)
  } finally {
    await redis.quit()
    process.exit(0)
  }
}

clearRealtimeData()

