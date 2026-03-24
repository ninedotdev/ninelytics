"use client"

import { useState } from "react"
import { toCountryCode, toCountryName } from "@/lib/country-names"

interface CountryFlagProps {
  countryCode?: string | null
  countryName?: string | null
  size?: number
  className?: string
}

function getFlagEmoji(code: string): string {
  if (!code || code.length !== 2) return "🌍"
  const codePoints = code.toUpperCase().split("").map((c) => 0x1f1e6 + c.charCodeAt(0) - 65)
  return String.fromCodePoint(...codePoints)
}

export function CountryFlag({ countryCode, countryName, size = 20, className = "" }: CountryFlagProps) {
  const [error, setError] = useState(false)

  const code = countryCode ? toCountryCode(countryCode) || countryCode : toCountryCode(countryName)

  if (!code) {
    return (
      <span style={{ fontSize: size * 0.85 }} className={`shrink-0 ${className}`} title={countryName ?? undefined}>
        🌍
      </span>
    )
  }

  const codeLower = code.toLowerCase()

  if (error) {
    return (
      <span style={{ fontSize: size * 0.85 }} className={`shrink-0 ${className}`} title={countryName || code}>
        {getFlagEmoji(code)}
      </span>
    )
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/country/${codeLower}.png`}
      alt={countryName || code}
      width={size}
      height={Math.round(size * 0.75)}
      className={`inline-block object-contain shrink-0 ${className}`}
      onError={() => setError(true)}
      title={countryName || code}
    />
  )
}
