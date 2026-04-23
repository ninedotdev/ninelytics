import { createHash } from "node:crypto"
import { connect, TLSSocket } from "node:tls"

export interface HealthCheckResult {
  status: "up" | "down" | "degraded" | "changed"
  statusCode?: number
  responseTime: number
  errorMessage?: string
  contentHash?: string
  sslExpiryDays?: number
  issues: string[]
}

export interface HealthCheckOptions {
  keyword?: string
  previousContentHash?: string
  baselineResponseTime?: number
  degradedThresholdMs?: number
}

export async function performHealthCheck(
  url: string,
  options: HealthCheckOptions = {}
): Promise<HealthCheckResult> {
  const issues: string[] = []
  const start = Date.now()

  try {
    const response = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(15000),
      headers: { "User-Agent": "Ninelytics-Uptime/1.0" },
      redirect: "follow",
    })

    const responseTime = Date.now() - start
    const html = await response.text()
    const contentHash = createHash("md5").update(html.substring(0, 5000)).digest("hex")

    // Check 1: HTTP status
    if (!response.ok) {
      issues.push(`HTTP ${response.status}: ${response.statusText}`)
    }

    // Check 2: Response time degradation
    const threshold = options.degradedThresholdMs
      ?? (options.baselineResponseTime ? options.baselineResponseTime * 2 : 5000)
    if (responseTime > threshold) {
      issues.push(`Slow response: ${responseTime}ms (threshold: ${threshold}ms)`)
    }

    // Check 3: Keyword presence
    if (options.keyword && !html.includes(options.keyword)) {
      issues.push(`Keyword "${options.keyword}" not found in page content`)
    }

    // Check 4: Content change detection
    let status: HealthCheckResult["status"] = "up"
    if (options.previousContentHash && contentHash !== options.previousContentHash) {
      issues.push("Page content changed unexpectedly")
      status = "changed"
    }

    // Check 5: SSL expiry
    const sslExpiryDays = await checkSSLExpiry(url)
    if (sslExpiryDays !== null && sslExpiryDays < 30) {
      issues.push(`SSL certificate expires in ${sslExpiryDays} days`)
    }

    if (!response.ok) status = "down"
    else if (issues.length > 0 && status !== "changed") status = "degraded"

    return {
      status,
      statusCode: response.status,
      responseTime,
      contentHash,
      sslExpiryDays: sslExpiryDays ?? undefined,
      issues,
    }
  } catch (error) {
    const responseTime = Date.now() - start
    const errorMessage = error instanceof Error ? error.message : "Unknown error"

    return {
      status: "down",
      responseTime,
      errorMessage,
      issues: [errorMessage],
    }
  }
}

async function checkSSLExpiry(url: string): Promise<number | null> {
  if (!url.startsWith("https")) return null
  try {
    const { hostname } = new URL(url)
    return await getSSLExpiryDays(hostname)
  } catch {
    return null
  }
}

function getSSLExpiryDays(hostname: string): Promise<number | null> {
  return new Promise((resolve) => {
    const socket = connect(443, hostname, { servername: hostname }, () => {
      const cert = (socket as TLSSocket).getPeerCertificate()
      socket.destroy()
      if (!cert?.valid_to) {
        resolve(null)
        return
      }
      const expiryDate = new Date(cert.valid_to)
      const daysLeft = Math.floor((expiryDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
      resolve(daysLeft)
    })
    socket.on("error", () => {
      socket.destroy()
      resolve(null)
    })
    socket.setTimeout(5000, () => {
      socket.destroy()
      resolve(null)
    })
  })
}
