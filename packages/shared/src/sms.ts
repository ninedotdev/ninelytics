import type { HealthCheckResult } from "./uptime"

interface UptimeSmsPayload {
  websiteName: string
  status: "down" | "recovered" | "degraded" | "ssl" | "content_changed"
  result: HealthCheckResult
  downtimeDuration?: string
}

export async function sendUptimeSms(phoneNumber: string, payload: UptimeSmsPayload) {
  const sid = process.env.TWILIO_ACCOUNT_SID
  const token = process.env.TWILIO_AUTH_TOKEN
  const from = process.env.TWILIO_PHONE_NUMBER
  if (!sid || !token || !from) return

  try {
    const twilio = await import("twilio")
    const client = twilio.default(sid, token)

    const messages: Record<string, string> = {
      down: `🔴 ${payload.websiteName} is DOWN. ${payload.result.issues[0] ?? "Not responding"}. Check: ${process.env.NEXT_PUBLIC_APP_URL}`,
      recovered: `🟢 ${payload.websiteName} is back ONLINE.${payload.downtimeDuration ? ` Downtime: ${payload.downtimeDuration}.` : ""}`,
      degraded: `🟡 ${payload.websiteName} is SLOW. Response: ${payload.result.responseTime}ms.`,
      ssl: `🔒 ${payload.websiteName} SSL expires in ${payload.result.sslExpiryDays} days. Renew soon.`,
      content_changed: `⚠️ ${payload.websiteName} content changed unexpectedly.`,
    }

    await client.messages.create({
      body: messages[payload.status] ?? `Alert: ${payload.websiteName}`,
      from,
      to: phoneNumber,
    })
  } catch (error) {
    console.error("[sms] Failed to send uptime alert:", error)
  }
}
