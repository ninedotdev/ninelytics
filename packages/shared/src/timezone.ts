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
 *
 * IMPORTANT: assumes the column is `timestamp without time zone` storing UTC
 * values (which is what `page_views.timestamp`, `events.timestamp` etc. do —
 * they're populated from ISO strings with `Z`). The first `AT TIME ZONE 'UTC'`
 * anchors the naive value as UTC; the second converts to the user's local
 * date. Without that first step, postgres treats the naive value as already
 * being in the target tz, off by the tz offset, breaking day buckets near
 * midnight.
 *
 * Usage: `${tzDate('pv.timestamp', tz)}`
 *   → `(pv.timestamp AT TIME ZONE 'UTC' AT TIME ZONE 'America/New_York')::date`
 */
export function tzDate(column: string, timezone: string): string {
  const tz = isValidTimezone(timezone) ? timezone : DEFAULT_TIMEZONE
  // Escape single quotes to prevent SQL injection
  const safeTz = tz.replace(/'/g, "''")
  return `(${column} AT TIME ZONE 'UTC' AT TIME ZONE '${safeTz}')::date`
}

/**
 * SQL fragment: today's date in the given timezone.
 */
export function tzToday(timezone: string): string {
  const tz = isValidTimezone(timezone) ? timezone : DEFAULT_TIMEZONE
  const safeTz = tz.replace(/'/g, "''")
  return `(NOW() AT TIME ZONE '${safeTz}')::date`
}
