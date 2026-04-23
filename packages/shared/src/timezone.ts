import { z } from "zod"

const DEFAULT_TIMEZONE = "America/New_York"

export function isValidTimezone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz })
    return true
  } catch {
    return false
  }
}

export function safeTimezone(tz: string | undefined | null): string {
  if (!tz) return DEFAULT_TIMEZONE
  return isValidTimezone(tz) ? tz : DEFAULT_TIMEZONE
}

/** Zod schema for timezone parameter */
export const timezoneParam = z
  .string()
  .optional()
  .default(DEFAULT_TIMEZONE)
  .transform((val) => (isValidTimezone(val) ? val : DEFAULT_TIMEZONE))

/**
 * SQL fragment: convert a timestamp column to a date in the given timezone.
 * Usage in raw SQL: `${tzDate('pv.timestamp', tz)}` → `(pv.timestamp AT TIME ZONE 'America/New_York')::date`
 */
export function tzDate(column: string, timezone: string): string {
  const tz = isValidTimezone(timezone) ? timezone : DEFAULT_TIMEZONE
  // Escape single quotes to prevent SQL injection
  const safeTz = tz.replace(/'/g, "''")
  return `(${column} AT TIME ZONE '${safeTz}')::date`
}

/**
 * SQL fragment: today's date in the given timezone.
 */
export function tzToday(timezone: string): string {
  const tz = isValidTimezone(timezone) ? timezone : DEFAULT_TIMEZONE
  const safeTz = tz.replace(/'/g, "''")
  return `(NOW() AT TIME ZONE '${safeTz}')::date`
}
