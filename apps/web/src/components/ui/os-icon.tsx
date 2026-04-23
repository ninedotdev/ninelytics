
import { useState } from "react"

interface OsIconProps {
  os?: string | null
  size?: number
  className?: string
}

function getOsSlug(os: string | null | undefined): string {
  if (!os) return "unknown"
  const o = os.toLowerCase().trim()

  if (o.includes("windows 11")) return "windows-11"
  if (o.includes("windows 10")) return "windows-10"
  if (o.includes("windows 8.1")) return "windows-8-1"
  if (o.includes("windows 8")) return "windows-8"
  if (o.includes("windows 7")) return "windows-7"
  if (o.includes("windows vista")) return "windows-vista"
  if (o.includes("windows xp")) return "windows-xp"
  if (o.includes("windows 98")) return "windows-98"
  if (o.includes("windows 95")) return "windows-95"
  if (o.includes("windows me")) return "windows-me"
  if (o.includes("windows 2000")) return "windows-2000"
  if (o.includes("windows 3")) return "windows-3-11"
  if (o.includes("windows server 2003")) return "windows-server-2003"
  if (o.includes("windows mobile")) return "windows-mobile"
  if (o.includes("windows")) return "windows-10"
  if (o.includes("mac os") || o.includes("macos") || o.includes("os x")) return "mac-os"
  if (o.includes("ios") || o.includes("iphone") || o.includes("ipad")) return "ios"
  if (o.includes("android")) return "android-os"
  if (o.includes("chrome os") || o.includes("chromeos")) return "chrome-os"
  if (o.includes("linux") || o.includes("ubuntu") || o.includes("debian") || o.includes("fedora")) return "linux"
  if (o.includes("blackberry")) return "blackberry-os"
  if (o.includes("amazon") || o.includes("fire os") || o.includes("kindle")) return "amazon-os"
  if (o.includes("sun") || o.includes("solaris")) return "sun-os"
  if (o.includes("openbsd") || o.includes("open bsd")) return "open-bsd"
  if (o.includes("qnx")) return "qnx"
  if (o.includes("beos")) return "beos"
  if (o.includes("os/2") || o.includes("os-2")) return "os-2"
  return "unknown"
}

export function OsIcon({ os, size = 20, className = "" }: OsIconProps) {
  const [error, setError] = useState(false)
  const slug = getOsSlug(os)

  if (error) {
    return (
      <span
        className={`inline-flex items-center justify-center rounded bg-muted text-[10px] font-semibold text-muted-foreground shrink-0 ${className}`}
        style={{ width: size, height: size }}
        title={os ?? undefined}
      >
        {(os ?? "?").slice(0, 1).toUpperCase()}
      </span>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/os/${slug}.png`}
      alt={os || "os"}
      width={size}
      height={size}
      className={`inline-block object-contain shrink-0 ${className}`}
      onError={() => setError(true)}
      title={os ?? undefined}
    />
  )
}
