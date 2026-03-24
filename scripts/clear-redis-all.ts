#!/usr/bin/env tsx
/**
 * Script to clear ALL data from Redis/Dragonfly
 * WARNING: This will delete ALL keys in the current database
 */

import Redis from 'ioredis'

const getRedisUrl = () => {
  return (
    process.env.REDIS_URL ||
    process.env.DRAGONFLY_URL ||
    'redis://localhost:6379'
  )
}

async function clearAllRedis() {
  // Create a new Redis instance for this script
  const redis = new Redis(getRedisUrl(), {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    lazyConnect: true,
    retryStrategy: () => null, // Don't retry on connection failure
  })

  try {
    console.log('Connecting to Redis...')
    console.log(`Using URL: ${getRedisUrl()}`)
    
    // Try to ping to check connection
    try {
      await redis.ping()
      console.log('Connected successfully!')
    } catch (error) {
      console.error('❌ Failed to connect to Redis')
      console.error('   Make sure Redis is running and accessible')
      console.error(`   Tried connecting to: ${getRedisUrl()}`)
      process.exit(1)
    }

    // Get all keys first to show what will be deleted
    console.log('Scanning for keys...')
    const allKeys = await redis.keys('*')
    console.log(`Found ${allKeys.length} keys to delete`)

    if (allKeys.length === 0) {
      console.log('✅ Redis is already empty!')
      redis.disconnect()
      process.exit(0)
    }

    // Show some sample keys
    if (allKeys.length > 0) {
      console.log('\nSample keys that will be deleted:')
      allKeys.slice(0, 10).forEach((key, i) => {
        console.log(`  ${i + 1}. ${key}`)
      })
      if (allKeys.length > 10) {
        console.log(`  ... and ${allKeys.length - 10} more`)
      }
    }

    // Flush the entire database
    console.log('\n⚠️  Clearing ALL data from Redis...')
    await redis.flushdb()
    
    console.log('✅ All Redis data cleared successfully!')
    console.log(`   Deleted ${allKeys.length} keys`)
  } catch (error) {
    console.error('❌ Error clearing Redis:', error)
    process.exit(1)
  } finally {
    redis.disconnect()
    process.exit(0)
  }
}

clearAllRedis()
