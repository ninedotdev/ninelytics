/**
 * URL normalization for consistent analytics tracking.
 * Without this, /about and /about/ and /about?ref=tw are counted as 3 different pages.
 */

/**
 * Normalize a URL path for consistent tracking:
 * - Remove trailing slash (except root "/")
 * - Optionally strip query parameters (controlled by STRIP_QUERY_PARAMS env)
 */
export function normalizeUrl(url: string | undefined | null): string | null {
  if (!url) return null

  let normalized = url

  // Remove trailing slash (except for root)
  if (normalized.length > 1 && normalized.endsWith('/')) {
    normalized = normalized.slice(0, -1)
  }

  // Strip query parameters if configured
  if (process.env.STRIP_QUERY_PARAMS === 'true') {
    const qIndex = normalized.indexOf('?')
    if (qIndex !== -1) {
      normalized = normalized.substring(0, qIndex)
    }
  }

  return normalized
}
