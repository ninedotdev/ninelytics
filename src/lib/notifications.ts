import { redis } from './redis';

export interface Notification {
  id: string;
  type: 'anomaly' | 'goal_achieved' | 'new_user' | 'traffic_spike' | 'system' | 'conversion';
  title: string;
  message: string;
  link?: string;
  isRead: boolean;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

/**
 * Create a notification for a user in Redis
 * Notifications expire after 7 days
 */
export async function createNotification(
  userId: string,
  notification: Omit<Notification, 'id' | 'isRead' | 'createdAt'>
): Promise<void> {
  try {
    
    const notif: Notification = {
      ...notification,
      id: `notif_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    const key = `notifications:${userId}`;
    
    // Add notification to list
    await redis.lpush(key, JSON.stringify(notif));
    
    // Keep only last 50 notifications
    await redis.ltrim(key, 0, 49);
    
    // Set expiration to 7 days
    await redis.expire(key, 60 * 60 * 24 * 7);
    
    // Increment unread count
    const unreadKey = `notifications:${userId}:unread`;
    await redis.incr(unreadKey);
    await redis.expire(unreadKey, 60 * 60 * 24 * 7);
  } catch (error) {
    console.error('Error creating notification:', error);
  }
}

/**
 * Get all notifications for a user
 */
export async function getNotifications(userId: string, limit = 20): Promise<Notification[]> {
  try {
    const key = `notifications:${userId}`;
    
    const notifications = await redis.lrange(key, 0, limit - 1);
    
    return notifications.map(n => JSON.parse(n));
  } catch (error) {
    console.error('Error getting notifications:', error);
    return [];
  }
}

/**
 * Get unread notification count
 */
export async function getUnreadCount(userId: string): Promise<number> {
  try {
    const unreadKey = `notifications:${userId}:unread`;
    
    const count = await redis.get(unreadKey);
    return count ? parseInt(count) : 0;
  } catch (error) {
    console.error('Error getting unread count:', error);
    return 0;
  }
}

/**
 * Mark a notification as read
 */
export async function markAsRead(userId: string, notificationId: string): Promise<void> {
  try {
    const key = `notifications:${userId}`;
    
    const notifications = await redis.lrange(key, 0, -1);
    
    for (let i = 0; i < notifications.length; i++) {
      const notif: Notification = JSON.parse(notifications[i]);
      
      if (notif.id === notificationId && !notif.isRead) {
        notif.isRead = true;
        
        // Update the notification in the list
        await redis.lset(key, i, JSON.stringify(notif));
        
        // Decrement unread count
        const unreadKey = `notifications:${userId}:unread`;
        await redis.decr(unreadKey);
        break;
      }
    }
  } catch (error) {
    console.error('Error marking notification as read:', error);
  }
}

/**
 * Mark all notifications as read
 */
export async function markAllAsRead(userId: string): Promise<void> {
  try {
    const key = `notifications:${userId}`;
    
    const notifications = await redis.lrange(key, 0, -1);
    
    for (let i = 0; i < notifications.length; i++) {
      const notif: Notification = JSON.parse(notifications[i]);
      
      if (!notif.isRead) {
        notif.isRead = true;
        await redis.lset(key, i, JSON.stringify(notif));
      }
    }
    
    // Reset unread count
    const unreadKey = `notifications:${userId}:unread`;
    await redis.set(unreadKey, 0);
  } catch (error) {
    console.error('Error marking all as read:', error);
  }
}

/**
 * Delete a notification
 */
export async function deleteNotification(userId: string, notificationId: string): Promise<void> {
  try {
    const key = `notifications:${userId}`;
    
    const notifications = await redis.lrange(key, 0, -1);
    
    for (const notification of notifications) {
      const notif: Notification = JSON.parse(notification);
      
      if (notif.id === notificationId) {
        await redis.lrem(key, 1, notification);
        
        if (!notif.isRead) {
          const unreadKey = `notifications:${userId}:unread`;
          await redis.decr(unreadKey);
        }
        break;
      }
    }
  } catch (error) {
    console.error('Error deleting notification:', error);
  }
}

