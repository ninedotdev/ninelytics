import { createNotification } from './notifications';
import { db } from '@/server/db/client';
import { websites, goals, userWebsiteAccess } from '@/server/db/schema';
import { eq } from 'drizzle-orm';

/**
 * Generate notification when an anomaly is detected
 */
export async function notifyAnomaly(
  websiteId: string,
  anomalyType: string,
  metric: string,
  changePercent: number
) {
  try {
    const website = await db.query.websites.findFirst({
      where: eq(websites.id, websiteId),
      columns: {
        name: true,
        ownerId: true,
      },
    });

    if (!website) return;

    const userAccess = await db.query.userWebsiteAccess.findMany({
      where: eq(userWebsiteAccess.websiteId, websiteId),
      columns: {
        userId: true,
        accessLevel: true,
      },
    });

    const severity = Math.abs(changePercent) > 50 ? 'Critical' : 'Warning';
    const direction = changePercent > 0 ? 'spike' : 'drop';

    const notification = {
      type: 'anomaly' as const,
      title: `${severity}: ${metric} ${direction} detected`,
      message: `${website.name} experienced a ${Math.abs(changePercent).toFixed(1)}% ${direction} in ${metric}`,
      link: `/analytics?website=${websiteId}`,
      metadata: {
        websiteId,
        anomalyType,
        metric,
        changePercent,
      },
    };

    // Notify owner
    await createNotification(website.ownerId, notification);

    // Notify users with write or read access
    for (const access of userAccess) {
      await createNotification(access.userId, notification);
    }
  } catch (error) {
    console.error('Error notifying anomaly:', error);
  }
}

/**
 * Generate notification when a goal is achieved
 */
export async function notifyGoalAchieved(goalId: string) {
  try {
    const goal = await db.query.goals.findFirst({
      where: eq(goals.id, goalId),
      columns: {
        id: true,
        name: true,
        websiteId: true,
      },
    });

    if (!goal) return;

    const website = await db.query.websites.findFirst({
      where: eq(websites.id, goal.websiteId),
      columns: {
        name: true,
        ownerId: true,
      },
    });

    if (!website) return;

    const userAccess = await db.query.userWebsiteAccess.findMany({
      where: eq(userWebsiteAccess.websiteId, goal.websiteId),
      columns: {
        userId: true,
      },
    });

    const notification = {
      type: 'goal_achieved' as const,
      title: `Goal achieved: ${goal.name}`,
      message: `The goal "${goal.name}" on ${website.name} has been achieved!`,
      link: `/goals/${goalId}`,
      metadata: {
        goalId,
        websiteId: goal.websiteId,
      },
    };

    // Notify owner
    await createNotification(website.ownerId, notification);

    // Notify all users with access to the website
    for (const access of userAccess) {
      await createNotification(access.userId, notification);
    }
  } catch (error) {
    console.error('Error notifying goal achieved:', error);
  }
}

/**
 * Generate notification when there's a traffic spike
 */
export async function notifyTrafficSpike(
  websiteId: string,
  currentVisitors: number,
  normalVisitors: number,
  increasePercent: number
) {
  try {
    const website = await db.query.websites.findFirst({
      where: eq(websites.id, websiteId),
      columns: {
        name: true,
        ownerId: true,
      },
    });

    if (!website) return;

    const userAccess = await db.query.userWebsiteAccess.findMany({
      where: eq(userWebsiteAccess.websiteId, websiteId),
      columns: {
        userId: true,
      },
    });

    const notification = {
      type: 'traffic_spike' as const,
      title: `Traffic spike on ${website.name}`,
      message: `Current traffic is ${increasePercent.toFixed(0)}% higher than normal (${currentVisitors} vs ${normalVisitors} visitors)`,
      link: `/realtime?website=${websiteId}`,
      metadata: {
        websiteId,
        currentVisitors,
        normalVisitors,
        increasePercent,
      },
    };

    // Notify owner
    await createNotification(website.ownerId, notification);

    // Notify all users with access
    for (const access of userAccess) {
      await createNotification(access.userId, notification);
    }
  } catch (error) {
    console.error('Error notifying traffic spike:', error);
  }
}

/**
 * Generate notification when a new user is invited
 */
export async function notifyNewUserInvite(
  userId: string,
  invitedByName: string,
  websiteName?: string
) {
  try {
    const notification = {
      type: 'system' as const,
      title: 'You have been invited!',
      message: websiteName
        ? `${invitedByName} invited you to collaborate on ${websiteName}`
        : `${invitedByName} invited you to join the analytics platform`,
      link: '/dashboard',
      metadata: {
        invitedBy: invitedByName,
        websiteName,
      },
    };

    await createNotification(userId, notification);
  } catch (error) {
    console.error('Error notifying new user invite:', error);
  }
}

/**
 * Generate notification for significant conversions
 */
export async function notifyConversion(
  websiteId: string,
  goalName: string,
  conversionValue?: number
) {
  try {
    const website = await db.query.websites.findFirst({
      where: eq(websites.id, websiteId),
      columns: {
        name: true,
        ownerId: true,
      },
    });

    if (!website) return;

    const userAccess = await db.query.userWebsiteAccess.findMany({
      where: eq(userWebsiteAccess.websiteId, websiteId),
      columns: {
        userId: true,
        accessLevel: true,
      },
    });

    const valueText = conversionValue ? ` worth $${conversionValue}` : '';
    
    const notification = {
      type: 'conversion' as const,
      title: `New conversion: ${goalName}`,
      message: `${website.name} just recorded a conversion for "${goalName}"${valueText}`,
      link: `/analytics?website=${websiteId}`,
      metadata: {
        websiteId,
        goalName,
        conversionValue,
      },
    };

    // Only notify owner and users with write access
    await createNotification(website.ownerId, notification);

    for (const access of userAccess) {
      if (access.accessLevel === 'WRITE') {
        await createNotification(access.userId, notification);
      }
    }
  } catch (error) {
    console.error('Error notifying conversion:', error);
  }
}

