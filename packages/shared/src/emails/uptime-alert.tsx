import {
  Body, Container, Head, Heading, Hr, Html,
  Preview, Section, Text, Button, Img,
} from "@react-email/components"

interface UptimeAlertEmailProps {
  websiteName: string
  websiteUrl: string
  status: "down" | "recovered" | "degraded" | "ssl" | "content_changed"
  responseTime?: number
  statusCode?: number
  issues: string[]
  estimatedLostVisitors?: number
  downtimeDuration?: string
  dashboardUrl: string
}

const statusConfig = {
  down: { emoji: "🔴", label: "DOWN", color: "#ef4444" },
  recovered: { emoji: "🟢", label: "RECOVERED", color: "#22c55e" },
  degraded: { emoji: "🟡", label: "DEGRADED", color: "#f59e0b" },
  ssl: { emoji: "🔒", label: "SSL EXPIRING", color: "#f59e0b" },
  content_changed: { emoji: "⚠️", label: "CONTENT CHANGED", color: "#f59e0b" },
}

export default function UptimeAlertEmail({
  websiteName,
  websiteUrl,
  status,
  responseTime,
  statusCode,
  issues,
  estimatedLostVisitors,
  downtimeDuration,
  dashboardUrl,
}: UptimeAlertEmailProps) {
  const config = statusConfig[status]

  return (
    <Html>
      <Head />
      <Preview>{config.emoji} {websiteName} is {config.label}</Preview>
      <Body style={{ backgroundColor: "#0a0a0a", fontFamily: "system-ui, -apple-system, sans-serif" }}>
        <Container style={{ maxWidth: "560px", margin: "0 auto", padding: "40px 20px" }}>

          <Section style={{ textAlign: "center", marginBottom: "32px" }}>
            <Img src={`${dashboardUrl}/logo.png`} width="120" alt="Ninelytics" />
          </Section>

          <Section style={{
            backgroundColor: "#141414",
            border: `1px solid ${config.color}`,
            borderRadius: "8px",
            padding: "24px",
            marginBottom: "24px",
          }}>
            <Text style={{ color: config.color, fontSize: "12px", margin: "0 0 8px", letterSpacing: "2px", fontFamily: "monospace" }}>
              {config.emoji} {config.label}
            </Text>
            <Heading style={{ color: "#ffffff", fontSize: "24px", margin: "0 0 8px" }}>
              {websiteName}
            </Heading>
            <Text style={{ color: "#888", fontSize: "14px", margin: "0" }}>
              {websiteUrl}
            </Text>
          </Section>

          <Section style={{
            backgroundColor: "#141414",
            borderRadius: "8px",
            padding: "20px",
            marginBottom: "24px",
          }}>
            {statusCode != null && (
              <Text style={{ color: "#888", fontSize: "13px", margin: "0 0 8px" }}>
                <span style={{ color: "#555" }}>Status Code</span>{"  "}
                <span style={{ color: "#fff" }}>{statusCode}</span>
              </Text>
            )}
            {responseTime != null && (
              <Text style={{ color: "#888", fontSize: "13px", margin: "0 0 8px" }}>
                <span style={{ color: "#555" }}>Response Time</span>{"  "}
                <span style={{ color: "#fff" }}>{responseTime}ms</span>
              </Text>
            )}
            {downtimeDuration && (
              <Text style={{ color: "#888", fontSize: "13px", margin: "0 0 8px" }}>
                <span style={{ color: "#555" }}>Downtime</span>{"  "}
                <span style={{ color: "#fff" }}>{downtimeDuration}</span>
              </Text>
            )}
            {estimatedLostVisitors != null && estimatedLostVisitors > 0 && (
              <Text style={{ color: "#888", fontSize: "13px", margin: "0 0 8px" }}>
                <span style={{ color: "#555" }}>Est. Lost Visitors</span>{"  "}
                <span style={{ color: "#ef4444" }}>~{estimatedLostVisitors}</span>
              </Text>
            )}
          </Section>

          {issues.length > 0 && (
            <Section style={{
              backgroundColor: "#141414",
              borderRadius: "8px",
              padding: "20px",
              marginBottom: "24px",
            }}>
              <Text style={{ color: "#555", fontSize: "11px", margin: "0 0 12px", letterSpacing: "1px", fontFamily: "monospace" }}>
                DETECTED ISSUES
              </Text>
              {issues.map((issue, i) => (
                <Text key={i} style={{ color: "#ccc", fontSize: "13px", margin: "0 0 6px" }}>
                  → {issue}
                </Text>
              ))}
            </Section>
          )}

          <Section style={{ textAlign: "center", marginBottom: "32px" }}>
            <Button
              href={dashboardUrl}
              style={{
                backgroundColor: "#09e5ab",
                color: "#000",
                padding: "12px 24px",
                borderRadius: "6px",
                fontSize: "13px",
                fontWeight: "bold",
                textDecoration: "none",
              }}
            >
              View Dashboard →
            </Button>
          </Section>

          <Hr style={{ borderColor: "#222" }} />
          <Text style={{ color: "#444", fontSize: "11px", textAlign: "center" }}>
            Ninelytics · Manage notification settings in your dashboard
          </Text>
        </Container>
      </Body>
    </Html>
  )
}
