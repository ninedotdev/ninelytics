import type { HealthCheckResult } from "./uptime"

interface UptimeEmailPayload {
  websiteName: string
  websiteUrl: string
  status: "down" | "recovered" | "degraded" | "ssl" | "content_changed"
  result: HealthCheckResult
  estimatedLostVisitors?: number
  downtimeDuration?: string
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${seconds % 60}s`
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  return `${h}h ${m}m`
}

export async function sendUptimeEmail(to: string, payload: UptimeEmailPayload) {
  if (!process.env.RESEND_API_KEY) return

  try {
    const { Resend } = await import("resend")
    const { default: UptimeAlertEmail } = await import("./emails/uptime-alert")

    const resend = new Resend(process.env.RESEND_API_KEY)

    const subjects: Record<string, string> = {
      down: `🔴 ${payload.websiteName} is down`,
      recovered: `🟢 ${payload.websiteName} is back online`,
      degraded: `🟡 ${payload.websiteName} is slow`,
      ssl: `🔒 ${payload.websiteName} SSL expiring soon`,
      content_changed: `⚠️ ${payload.websiteName} content changed`,
    }

    await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || "alerts@ninelytics.com",
      to,
      subject: subjects[payload.status] ?? `Alert: ${payload.websiteName}`,
      react: UptimeAlertEmail({
        websiteName: payload.websiteName,
        websiteUrl: payload.websiteUrl,
        status: payload.status,
        responseTime: payload.result.responseTime,
        statusCode: payload.result.statusCode,
        issues: payload.result.issues,
        estimatedLostVisitors: payload.estimatedLostVisitors,
        downtimeDuration: payload.downtimeDuration
          ? payload.downtimeDuration
          : undefined,
        dashboardUrl: process.env.NEXT_PUBLIC_APP_URL || "https://localhost:3000",
      }),
    })
  } catch (error) {
    console.error("[email] Failed to send uptime alert:", error)
  }
}

export { formatDuration }
