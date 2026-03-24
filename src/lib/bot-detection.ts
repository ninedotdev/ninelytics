import { isbot } from 'isbot'

/**
 * Check if the request comes from a bot/crawler based on the User-Agent header.
 * Uses the `isbot` library (same approach as Umami) which covers:
 * - Search engine crawlers (Google, Bing, etc.)
 * - Social media crawlers (Facebook, Twitter)
 * - Monitoring/analytics bots
 * - CI/CD runners
 */
export function isBotRequest(userAgent: string | null): boolean {
  if (!userAgent) return true
  return isbot(userAgent)
}
