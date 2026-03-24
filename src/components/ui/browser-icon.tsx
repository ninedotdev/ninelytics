"use client"

import { useState } from "react"

interface BrowserIconProps {
  browser?: string | null
  size?: number
  className?: string
}

function getBrowserSlug(browser: string | null | undefined): string {
  if (!browser) return "unknown"
  const b = browser.toLowerCase().trim()

  if (b.includes("chrome ios") || b === "crios") return "crios"
  if (b.includes("firefox ios") || b === "fxios") return "fxios"
  if (b.includes("edge ios")) return "edge-ios"
  if (b.includes("edge chromium") || b.includes("edg/")) return "edge-chromium"
  if (b.includes("edge") || b.includes("microsoft edge")) return "edge"
  if (b.includes("chromium")) return "chromium-webview"
  if (b.includes("chrome")) return "chrome"
  if (b.includes("firefox")) return "firefox"
  if (b.includes("safari")) return "safari"
  if (b.includes("opera mini")) return "opera-mini"
  if (b.includes("opera")) return "opera"
  if (b.includes("brave")) return "brave"
  if (b.includes("samsung")) return "samsung"
  if (b.includes("yandex")) return "yandexbrowser"
  if (b.includes("instagram")) return "instagram"
  if (b.includes("facebook") || b === "fban" || b === "fbios") return "facebook"
  if (b.includes("silk")) return "silk"
  if (b.includes("miui")) return "miui"
  if (b.includes("kakaotalk")) return "kakaotalk"
  if (b.includes("blackberry")) return "blackberry"
  if (b.includes("android webview")) return "android-webview"
  if (b.includes("android")) return "android"
  if (b.includes("ios webview")) return "ios-webview"
  if (b.includes("ios")) return "ios"
  if (b === "ie" || b.includes("internet explorer") || b.includes("trident")) return "ie"
  if (b.includes("beaker")) return "beaker"
  if (b.includes("aol")) return "aol"
  if (b.includes("curl")) return "curl"
  if (b.includes("bot") || b.includes("crawler") || b.includes("spider")) return "searchbot"
  return "unknown"
}

export function BrowserIcon({ browser, size = 20, className = "" }: BrowserIconProps) {
  const [error, setError] = useState(false)
  const slug = getBrowserSlug(browser)

  if (error) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded bg-muted text-[10px] font-semibold text-muted-foreground shrink-0 ${className}`}
        style={{ width: size, height: size }}
        title={browser ?? undefined}
      >
        {(browser ?? "?").slice(0, 1).toUpperCase()}
      </span>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/browser/${slug}.png`}
      alt={browser || "browser"}
      width={size}
      height={size}
      className={`inline-block object-contain shrink-0 ${className}`}
      onError={() => setError(true)}
      title={browser ?? undefined}
    />
  )
}
