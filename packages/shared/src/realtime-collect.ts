/**
 * Realtime updates run at api request time, NOT at worker process time.
 *
 * Why: the realtime UI ("active visitors", "live event feed") needs to feel
 * immediate. Doing the Redis writes only when the worker drains a job means
 * any worker backlog directly translates to realtime lag — defeating the
 * point of the page. The persistent DB record still happens via the worker;
 * realtime is a fire-and-forget Redis-only fast path.
 */
import { realtimeHelpers, isRedisConnected } from './redis'
import { getActiveWebsiteByTrackingCode } from './tracking-websites'
import { isPathExcluded } from './path-exclusions'
import { normalizeUrl } from './url-normalization'
import { deriveCookielessVisitorId, type CollectPayload } from './collect'

interface RealtimeContext {
  ipAddress: string
  headerUserAgent: string
  headers: Headers
}

export async function updateRealtimeFromCollect(
  payload: CollectPayload,
  ctx: RealtimeContext,
): Promise<void> {
  if (!isRedisConnected) return
  if (!payload.trackingCode || !payload.visitorId) return
  // Sessions don't show in the realtime ticker; only pageviews and events.
  if (payload.type !== 'pageview' && payload.type !== 'event') return

  const website = await getActiveWebsiteByTrackingCode(payload.trackingCode)
  if (!website) return

  // Mirror processEvent's exclusion logic so realtime and the persistent
  // DB never disagree about whether an event "happened".
  if (payload.type === 'pageview') {
    if (!payload.page) return
    if (isPathExcluded(payload.page, website.excludedPaths)) return
  } else {
    if (!payload.eventType || !payload.eventName || !payload.page) return
  }

  // For cookieless sites, the worker overwrites the SDK-supplied visitorId
  // with a hash of (websiteId, ip, ua, day) so multiple browser sessions
  // from the same IP+UA collapse to one persistent visitor. Realtime must
  // use the same identity, otherwise "active visitors now" inflates
  // dramatically vs "Unique Visitors Today" in the DB-backed dashboards.
  const visitorId = website.cookielessMode
    ? await deriveCookielessVisitorId(
        website.id,
        ctx.ipAddress,
        payload.userAgent || ctx.headerUserAgent,
      )
    : payload.visitorId

  // Lightweight geo via edge headers. Full MaxMind lookup stays in the
  // worker (it's CPU-bound and not needed for the live ticker).
  const country =
    ctx.headers.get('cf-ipcountry') ||
    ctx.headers.get('x-vercel-ip-country') ||
    ctx.headers.get('cloudfront-viewer-country') ||
    undefined
  const city =
    ctx.headers.get('cf-ipcity') ||
    ctx.headers.get('x-vercel-ip-city') ||
    ctx.headers.get('cloudfront-viewer-city') ||
    undefined

  const page =
    payload.type === 'pageview'
      ? (normalizeUrl(payload.page) || payload.page || '')
      : payload.page || ''

  // Pipelined Redis ops — together ~1-2ms.
  realtimeHelpers
    .markVisitorActive(website.id, visitorId, {
      page,
      country,
      city,
      device: payload.device,
      browser: payload.browser,
    })
    .catch((err) => console.error('Realtime markVisitorActive failed:', err))

  if (payload.type === 'pageview') {
    realtimeHelpers
      .addLiveEvent(website.id, {
        type: 'pageview',
        name: 'Page View',
        page,
        visitorId,
        timestamp: Date.now(),
      })
      .catch((err) => console.error('Realtime addLiveEvent failed:', err))
  } else if (payload.type === 'event') {
    realtimeHelpers
      .addLiveEvent(website.id, {
        type: payload.eventType ?? 'custom',
        name: payload.eventName ?? 'event',
        page,
        visitorId,
        timestamp: Date.now(),
        properties: payload.properties || {},
      })
      .catch((err) => console.error('Realtime addLiveEvent failed:', err))
  }
}
