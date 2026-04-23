import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Parse a date ensuring UTC interpretation.
 * DB timestamps come without "Z" suffix (timestamp without time zone)
 * so JS treats them as local time. This ensures they're parsed as UTC.
 */
function parseAsUtc(date: string | Date): Date {
  if (date instanceof Date) return date
  // If it's a string without timezone info, append Z to force UTC
  if (typeof date === "string" && !date.endsWith("Z") && !date.includes("+") && !date.includes("T")) {
    return new Date(date.replace(" ", "T") + "Z")
  }
  if (typeof date === "string" && !date.endsWith("Z") && !date.includes("+")) {
    return new Date(date + "Z")
  }
  return new Date(date)
}

export function formatDate(date: string | Date, style: "short" | "medium" | "long" = "medium", timezone?: string) {
  const tz = timezone || getBrowserTimezone()
  return parseAsUtc(date).toLocaleString("en-US", {
    timeZone: tz,
    dateStyle: style,
    timeStyle: "short",
  })
}

export function formatDateOnly(date: string | Date, style: "short" | "medium" | "long" = "medium", timezone?: string) {
  const tz = timezone || getBrowserTimezone()
  return parseAsUtc(date).toLocaleDateString("en-US", {
    timeZone: tz,
    dateStyle: style,
  })
}

function getBrowserTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone
  } catch {
    return "America/New_York"
  }
}
