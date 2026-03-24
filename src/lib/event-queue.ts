// Event queue system to handle tracking order issues
import { db } from '@/server/db/client'
import { events } from '@/server/db/schema'
import { upsertVisitor, upsertSession } from './tracking-helpers'

interface QueuedEvent {
  id: string
  websiteId: string
  visitorId: string
  sessionId: string
  eventType: string
  eventName: string
  page: string
  properties: Record<string, unknown>
  timestamp: string
  retryCount: number
  maxRetries: number
}

class EventQueue {
  private static instance: EventQueue
  private queue: QueuedEvent[] = []
  private processing = false
  private readonly BATCH_SIZE = 10
  private readonly RETRY_DELAY = 1000 // 1 second

  static getInstance(): EventQueue {
    if (!EventQueue.instance) {
      EventQueue.instance = new EventQueue()
    }
    return EventQueue.instance
  }

  // Add event to queue
  async addEvent(eventData: Omit<QueuedEvent, 'id' | 'retryCount' | 'maxRetries'>): Promise<void> {
    const event: QueuedEvent = {
      ...eventData,
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      retryCount: 0,
      maxRetries: 3
    }

    this.queue.push(event)
    
    // Start processing if not already running
    if (!this.processing) {
      this.processQueue()
    }
  }

  // Process events in the queue
  private async processQueue(): Promise<void> {
    if (this.processing || this.queue.length === 0) {
      return
    }

    this.processing = true

    try {
      while (this.queue.length > 0) {
        const batch = this.queue.splice(0, this.BATCH_SIZE)
        await this.processBatch(batch)
      }
    } finally {
      this.processing = false
    }
  }

  // Process a batch of events
  private async processBatch(events: QueuedEvent[]): Promise<void> {
    const promises = events.map(event => this.processEvent(event))
    await Promise.allSettled(promises)
  }

  // Process a single event
  private async processEvent(event: QueuedEvent): Promise<void> {
    try {
      // Ensure visitor and session exist
      await upsertVisitor({
        websiteId: event.websiteId,
        visitorId: event.visitorId,
        ipAddress: '127.0.0.1', // Default IP
        userAgent: 'Event Queue', // Default user agent
      })

      await upsertSession({
        websiteId: event.websiteId,
        visitorId: event.visitorId,
        sessionId: event.sessionId,
        landingPage: event.page,
      })

      // Create the event
      await db.insert(events).values({
        websiteId: event.websiteId,
        visitorId: event.visitorId,
        sessionId: event.sessionId,
        eventType: event.eventType,
        eventName: event.eventName,
        page: event.page,
        properties: event.properties,
        timestamp: event.timestamp
      })

      console.log(`Event processed successfully: ${event.id}`)
    } catch (error) {
      console.error(`Error processing event ${event.id}:`, error)
      
      // Retry logic
      if (event.retryCount < event.maxRetries) {
        event.retryCount++
        console.log(`Retrying event ${event.id} (attempt ${event.retryCount})`)
        
        // Add back to queue with delay
        setTimeout(() => {
          this.queue.push(event)
          if (!this.processing) {
            this.processQueue()
          }
        }, this.RETRY_DELAY * event.retryCount)
      } else {
        console.error(`Event ${event.id} failed after ${event.maxRetries} retries`)
      }
    }
  }

  // Get queue status
  getStatus() {
    return {
      queueLength: this.queue.length,
      processing: this.processing,
      events: this.queue.map(e => ({
        id: e.id,
        eventType: e.eventType,
        eventName: e.eventName,
        retryCount: e.retryCount
      }))
    }
  }

  // Clear queue (for testing)
  clearQueue() {
    this.queue = []
  }
}

export const eventQueue = EventQueue.getInstance()
