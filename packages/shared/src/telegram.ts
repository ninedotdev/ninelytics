import type { HealthCheckResult } from "./uptime"

interface UptimeTelegramPayload {
  websiteName: string
  websiteUrl: string
  status: "down" | "recovered" | "degraded" | "ssl" | "content_changed"
  result: HealthCheckResult
  estimatedLostVisitors?: number
  downtimeDuration?: string
}

const statusEmoji: Record<string, string> = {
  down: "🔴",
  recovered: "🟢",
  degraded: "🟡",
  ssl: "🔒",
  content_changed: "⚠️",
}

export async function sendTelegramMessage(
  botToken: string,
  chatId: string,
  payload: UptimeTelegramPayload
) {
  if (!botToken || !chatId) return

  try {
    const lines = [
      `${statusEmoji[payload.status] ?? "⚠️"} *${payload.websiteName}* is ${payload.status.toUpperCase()}`,
      ``,
      `🌐 \`${payload.websiteUrl}\``,
    ]

    if (payload.result.statusCode) lines.push(`📊 Status: \`${payload.result.statusCode}\``)
    if (payload.result.responseTime) lines.push(`⚡ Response: \`${payload.result.responseTime}ms\``)
    if (payload.downtimeDuration) lines.push(`⏱ Downtime: \`${payload.downtimeDuration}\``)
    if (payload.estimatedLostVisitors && payload.estimatedLostVisitors > 0) {
      lines.push(`👥 Est. lost visitors: \`~${payload.estimatedLostVisitors}\``)
    }

    if (payload.result.issues.length > 0) {
      lines.push(``, `*Issues:*`)
      for (const issue of payload.result.issues) {
        lines.push(`→ ${issue}`)
      }
    }

    lines.push(``, `[View Dashboard](${process.env.APP_URL})`)

    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: lines.join("\n"),
        parse_mode: "Markdown",
        disable_web_page_preview: true,
      }),
    })
  } catch (error) {
    console.error("[telegram] Failed to send uptime alert:", error)
  }
}

/** Send a simple text message via Telegram bot */
export async function sendTelegramReply(botToken: string, chatId: string, text: string) {
  if (!botToken || !chatId) return
  await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "Markdown" }),
  })
}
