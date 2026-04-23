
import { useState } from "react"

interface DeviceIconProps {
  device?: string | null
  size?: number
  className?: string
}

function getDeviceSlug(device: string | null | undefined): string {
  if (!device) return "unknown"
  const d = device.toLowerCase().trim()
  if (d.includes("mobile") || d.includes("phone")) return "mobile"
  if (d.includes("tablet") || d.includes("ipad")) return "tablet"
  if (d.includes("laptop")) return "laptop"
  if (d.includes("desktop") || d.includes("pc")) return "desktop"
  return "unknown"
}

export function DeviceIcon({ device, size = 20, className = "" }: DeviceIconProps) {
  const [error, setError] = useState(false)
  const slug = getDeviceSlug(device)

  if (error) {
    const emoji = slug === "mobile" ? "📱" : slug === "tablet" ? "⬜" : slug === "laptop" ? "💻" : "🖥️"
    return (
      <span style={{ fontSize: size * 0.85 }} className={`shrink-0 ${className}`} title={device ?? undefined}>
        {emoji}
      </span>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/device/${slug}.png`}
      alt={device || "device"}
      width={size}
      height={size}
      className={`inline-block object-contain shrink-0 ${className}`}
      onError={() => setError(true)}
      title={device ?? undefined}
    />
  )
}
