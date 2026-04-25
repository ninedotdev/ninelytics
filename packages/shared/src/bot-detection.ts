import { isbot } from 'isbot'

/**
 * Check if the request comes from a bot/crawler based on the User-Agent header.
 * - Search engine crawlers (Google, Bing, etc.)
 * - Social media crawlers (Facebook, Twitter)
 * - Monitoring/analytics bots
 * - CI/CD runners
 */
export function isBotRequest(userAgent: string | null): boolean {
  if (!userAgent) return true
  return isbot(userAgent)
}
