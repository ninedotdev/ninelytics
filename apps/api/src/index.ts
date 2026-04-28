import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { secureHeaders } from 'hono/secure-headers'
import { logger } from 'hono/logger'
import { health } from '@/routes/health'
import { collect } from '@/routes/collect'
import { batch } from '@/routes/batch'
import { track } from '@/routes/track'
import { vitals } from '@/routes/vitals'
import { websitesConfig } from '@/routes/websites-config'
import { publicShare } from '@/routes/public-share'
import { aiChat } from '@/routes/ai-chat'
import { trpc } from '@/routes/trpc'
import { auth } from '@/routes/auth'
import { ensureMaxmindDatabase } from '@ninelytics/shared/maxmind-updater'
import { startDailyStatsFlusher } from '@ninelytics/shared/daily-stats'

// Fire-and-forget at boot. Downloads / refreshes the local GeoLite2-City
// database when MAXMIND_LICENSE_KEY is set. Without this the geolocation
// service silently falls back to ip-api.com (45 req/min hard rate limit).
void ensureMaxmindDatabase()

// The api processes events inline when the queue is full / Redis is down.
// Those code paths call processEvent → bumpDailyPageView, so the api also
// needs an active flusher to drain its in-memory counters.
startDailyStatsFlusher()

const app = new Hono()

// ─── Global middleware ──────────────────────────────────────────────────────
app.use('*', logger())
// `secureHeaders()` defaults emit `Cross-Origin-Resource-Policy: same-origin`
// which makes cross-origin browsers refuse to read responses from our public
// tracking endpoints (analytics.js → /api/collect, speed-insights.js →
// /api/vitals, etc.) with ERR_BLOCKED_BY_RESPONSE.NotSameOrigin. The API is
// designed to be called from any origin, so opt every response into being
// cross-origin readable. Per-route CORS still controls which origins are
// allowed; this header just controls *embeddability*.
app.use(
  '*',
  secureHeaders({
    crossOriginResourcePolicy: 'cross-origin',
  })
)

// CORS is tight by default — tracking endpoints override this per-route.
app.use(
  '/api/collect',
  cors({
    origin: '*',
    allowMethods: ['POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
    credentials: true,
  })
)
app.use(
  '/api/batch',
  cors({
    origin: '*',
    allowMethods: ['POST', 'OPTIONS'],
    allowHeaders: ['Content-Type'],
    credentials: true,
  })
)
app.use(
  '/api/track/*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'OPTIONS', 'PUT', 'PATCH', 'DELETE'],
    allowHeaders: [
      'X-CSRF-Token', 'X-Requested-With', 'Accept', 'Accept-Version',
      'Content-Length', 'Content-MD5', 'Content-Type', 'Date', 'X-Api-Version',
    ],
    credentials: true,
  })
)
app.use(
  '/api/vitals',
  cors({ origin: '*', allowMethods: ['POST', 'OPTIONS'], allowHeaders: ['Content-Type'] })
)
app.use(
  '/api/websites/config/*',
  cors({ origin: '*', allowMethods: ['GET', 'OPTIONS'], allowHeaders: ['Content-Type'] })
)
app.use(
  '/api/public/share/*',
  cors({ origin: '*', allowMethods: ['GET', 'OPTIONS'], allowHeaders: ['Content-Type'] })
)

// ─── Routes ─────────────────────────────────────────────────────────────────
app.route('/api/health', health)
app.route('/api/collect', collect)
app.route('/api/batch', batch)
app.route('/api/track', track)
app.route('/api/vitals', vitals)
app.route('/api/websites/config', websitesConfig)
app.route('/api/public/share', publicShare)
app.route('/api/trpc', trpc)
app.route('/api/auth', auth)
app.route('/api/ai-chat', aiChat)

app.get('/', (c) => c.json({ name: 'ninelytics-api', version: '0.0.0' }))

// ─── Process safety nets ────────────────────────────────────────────────────
process.on('uncaughtException', (err) => {
  console.error('[FATAL] uncaughtException:', err.stack ?? err)
})
process.on('unhandledRejection', (reason) => {
  console.error('[FATAL] unhandledRejection:', reason)
})

// Heartbeat — lets us tell event-loop blockage apart from socket close later.
if (!process.env.DISABLE_HEARTBEAT) {
  setInterval(() => {
    const m = process.memoryUsage()
    console.log(
      `[hb] rss=${(m.rss / 1e6).toFixed(0)}MB heap=${(m.heapUsed / 1e6).toFixed(0)}/${(m.heapTotal / 1e6).toFixed(0)}MB`
    )
  }, 30_000).unref()
}

// ─── Server ─────────────────────────────────────────────────────────────────
const port = Number(process.env.PORT ?? 3001)
console.log(`[api] listening on :${port}`)

export default {
  port,
  fetch: app.fetch,
  // Longer idle timeout so Coolify/Traefik keep-alive works predictably.
  idleTimeout: 30,
}
