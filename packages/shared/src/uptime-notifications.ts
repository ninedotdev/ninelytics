import { createNotification } from "./notifications"
import { db } from "./db"
import { websites, users, userWebsiteAccess } from "@ninelytics/db/schema"
import { eq } from "drizzle-orm"
import type { HealthCheckResult } from "./uptime"
import { sendUptimeEmail, formatDuration } from "./email"
import { sendUptimeSms } from "./sms"
import { sendTelegramMessage } from "./telegram"

type UptimeEventType = "down" | "recovered" | "degraded" | "ssl" | "content_changed"

const messages: Record<UptimeEventType, (name: string, result: HealthCheckResult) => { title: string; message: string }> = {
  down: (name, result) => ({
    title: `${name} is down`,
    message: result.issues[0] ?? "Site is not responding",
  }),
  recovered: (name) => ({
    title: `${name} is back online`,
    message: "The site has recovered and is responding normally",
  }),
  degraded: (name, result) => ({
    title: `${name} is responding slowly`,
    message: `Response time: ${result.responseTime}ms`,
  }),
  ssl: (name, result) => ({
    title: `SSL certificate expiring soon`,
    message: `${name} SSL expires in ${result.sslExpiryDays} days`,
  }),
  content_changed: (name) => ({
    title: `${name} content changed`,
    message: "Unexpected page content change detected",
  }),
}

// Map event types to user preference fields
const eventToPreference: Record<UptimeEventType, string> = {
  down: "notifyOnDown",
  recovered: "notifyOnRecovered",
  degraded: "notifyOnDegraded",
  ssl: "notifyOnSslExpiry",
  content_changed: "notifyOnContentChange",
}

export async function notifyUptimeChange(
  websiteId: string,
  type: UptimeEventType,
  result: HealthCheckResult,
  incidentMeta?: { estimatedLostVisitors?: number; durationSeconds?: number }
) {
  try {
    const website = await db.query.websites.findFirst({
      where: eq(websites.id, websiteId),
      columns: { name: true, url: true, ownerId: true },
    })
    if (!website) return

    const msg = messages[type](website.name, result)
    const prefKey = eventToPreference[type]

    const notification = {
      type: "system" as const,
      title: msg.title,
      message: msg.message,
      link: `/websites/${websiteId}/settings?tab=uptime`,
      metadata: {
        subtype: `uptime_${type}`,
        websiteId,
        responseTime: result.responseTime,
        statusCode: result.statusCode,
      },
    }

    // Collect all users to notify (owner + collaborators)
    const userIds = new Set<string>([website.ownerId])
    const access = await db.query.userWebsiteAccess.findMany({
      where: eq(userWebsiteAccess.websiteId, websiteId),
      columns: { userId: true },
    })
    for (const a of access) userIds.add(a.userId)

    const downtimeDuration = incidentMeta?.durationSeconds
      ? formatDuration(incidentMeta.durationSeconds)
      : undefined

    // Notify each user via their enabled channels
    for (const userId of userIds) {
      const user = await db.query.users.findFirst({
        where: eq(users.id, userId),
      })
      if (!user) continue

      const prefs = user as Record<string, unknown>
      // Skip if user disabled this event type
      if (prefs[prefKey] === false) continue

      const channels: Promise<void>[] = []

      // In-app notification
      if (prefs.notifyViaApp !== false) {
        channels.push(createNotification(userId, notification))
      }

      // Email
      if (prefs.notifyViaEmail !== false && user.email) {
        channels.push(sendUptimeEmail(user.email, {
          websiteName: website.name,
          websiteUrl: website.url,
          status: type,
          result,
          estimatedLostVisitors: incidentMeta?.estimatedLostVisitors,
          downtimeDuration,
        }))
      }

      // SMS
      if (prefs.notifyViaSms === true && user.phoneNumber) {
        channels.push(sendUptimeSms(user.phoneNumber, {
          websiteName: website.name,
          status: type,
          result,
          downtimeDuration,
        }))
      }

      // Telegram
      if (prefs.notifyViaTelegram === true && user.telegramChatId && user.telegramBotToken) {
        channels.push(sendTelegramMessage(user.telegramBotToken, user.telegramChatId, {
          websiteName: website.name,
          websiteUrl: website.url,
          status: type,
          result,
          estimatedLostVisitors: incidentMeta?.estimatedLostVisitors,
          downtimeDuration,
        }))
      }

      // Fire all channels in parallel — don't let one failure block others
      await Promise.allSettled(channels)
    }
  } catch (error) {
    console.error("[uptime-notifications] Error:", error)
  }
}
