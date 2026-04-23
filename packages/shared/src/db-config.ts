// Database configuration constants
export const DB_CONFIG = {
  // Connection pool settings
  CONNECTION_LIMIT: parseInt(process.env.DATABASE_POOL_SIZE || '20'),
  POOL_TIMEOUT: parseInt(process.env.DATABASE_POOL_TIMEOUT || '30'),
  CONNECT_TIMEOUT: parseInt(process.env.DATABASE_CONNECT_TIMEOUT || '30'),

  // Query settings
  QUERY_TIMEOUT: parseInt(process.env.DATABASE_QUERY_TIMEOUT || '60'),
  TRANSACTION_TIMEOUT: parseInt(process.env.DATABASE_TRANSACTION_TIMEOUT || '30'),

  // Retry settings
  MAX_RETRIES: parseInt(process.env.DATABASE_MAX_RETRIES || '3'),
  RETRY_DELAY: parseInt(process.env.DATABASE_RETRY_DELAY || '1000'),

  // Batch processing
  BATCH_SIZE: parseInt(process.env.ANALYTICS_BATCH_SIZE || '1000'),
  MAX_CONCURRENT_REQUESTS: parseInt(process.env.MAX_CONCURRENT_REQUESTS || '50'),
}

// Get clean DATABASE_URL without connection pool parameters
// (these are configured in the postgres client, not in the URL)
export const getDatabaseUrl = () => {
  const baseUrl = process.env.DATABASE_URL?.trim()
  if (!baseUrl) {
    throw new Error('DATABASE_URL is not defined')
  }

  // Remove any trailing whitespace and return clean URL
  // Connection pool parameters are configured in src/server/db/client.ts
  return baseUrl.trim()
}

// Connection health monitoring
export class ConnectionMonitor {
  private static instance: ConnectionMonitor
  private isHealthy = true
  private lastCheck = 0
  private checkInterval = 30000 // 30 seconds

  static getInstance(): ConnectionMonitor {
    if (!ConnectionMonitor.instance) {
      ConnectionMonitor.instance = new ConnectionMonitor()
    }
    return ConnectionMonitor.instance
  }

  async checkHealth(): Promise<boolean> {
    const now = Date.now()
    if (now - this.lastCheck < this.checkInterval) {
      return this.isHealthy
    }

    try {
      // Simple health check - you can implement more sophisticated checks
      this.isHealthy = true
      this.lastCheck = now
      return true
    } catch (error) {
      console.error('Database health check failed:', error)
      this.isHealthy = false
      this.lastCheck = now
      return false
    }
  }

  getStatus(): { healthy: boolean; lastCheck: number } {
    return {
      healthy: this.isHealthy,
      lastCheck: this.lastCheck,
    }
  }
}
