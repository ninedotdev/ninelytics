# Ninelytics

A self-hosted, privacy-first web analytics platform. Track pageviews, events, sessions, and conversions across multiple websites from a single dashboard — with real-time data, AI-powered insights, geo-location maps, custom reports, and goal tracking.

Built on a **Bun + Hono + TanStack Start** monorepo: a thin Hono API for high-throughput ingest and tRPC, a dedicated Bun worker for the tracking queue and scheduled jobs, and a TanStack Start frontend.

![Dashboard](public/repo/dashboard.png)

> **Does it scale?** This has been running 13+ websites, including a county government site processing thousands of events, on a laptop behind a Cloudflare Tunnel. 1.5% CPU, 474 MB RAM, the 4 containers.
>
> ![Metrics](public/repo/metrics.png)

---

## Features

- **Multi-website tracking** — manage and monitor multiple sites from one account
- **Real-time analytics** — live visitor feed with session and event data
- **Interactive map** — visitor geo-location powered by MapLibre GL and MaxMind
- **Custom reports** — build and save your own report queries
- **Goal tracking** — define pageview, event, and duration goals with conversion funnels
- **AI assistant** — ask questions about your data in natural language (GPT, Claude, Gemini)
- **Role-based access** — Admin, Owner, and Viewer roles with per-website permissions
- **Dark / light theme** — system-aware with manual toggle
- **Analytics consent** — built-in GDPR-friendly consent banner with granular controls
- **Cloudflare Analytics import** — connect your Cloudflare API token to import historical traffic data
- **Google Analytics 4 import** — connect via OAuth to import historical GA4 data and breakdowns
- **Google Search Console** — import search queries, clicks, impressions, CTR, and positions via OAuth
- **Stripe revenue tracking** — connect a restricted API key to correlate revenue with analytics
- **PostHog import** — import analytics from PostHog via HogQL Query API (pageviews, sessions, bounce rate, breakdowns)
- **Sitemap auto-indexing** — automatically submit new pages to Google (Indexing API) and Bing/other engines (IndexNow) whenever your sitemap changes
- **7-day forecast** — traffic and revenue predictions based on weighted moving average with weekly seasonality
- **Revenue charts** — daily revenue bar charts and forecast when Stripe is connected
- **Performance badges** — automatic website health indicators (On Fire, Growing, Steady, Declining, Inactive)
- **Browser-driven timezone** — all stats respect the user's local timezone automatically
- **Export** — download analytics as CSV, Excel, or JSON

### Screenshots

**Charts & Analytics**

<p>
  <img src="public/repo/charts-1.png" width="32%" />
  <img src="public/repo/charts-2.png" width="32%" />
  <img src="public/repo/charts-3.png" width="32%" />
</p>

**AI Insights — chat with your analytics data, generate charts on demand**

<p>
  <img src="public/repo/ai-1.png" width="49%" />
  <img src="public/repo/ai-2.png" width="49%" />
</p>

**Documentation — setup guides for all integrations**

![Docs](public/repo/docs.png)

---

## Integrations

All integrations are optional and configured from the Settings page (credentials) and per-website settings (linking). Historical data merges with live tracking — no gaps when migrating.

| Integration               | Auth method                                 | What it imports                                                                                                             |
| ------------------------- | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| **Cloudflare**            | API Token (per-user)                        | Historical pageviews, visitors, top countries/devices/pages/browsers                                                        |
| **Google Analytics 4**    | OAuth (per-user)                            | Historical pageviews, visitors, breakdowns (countries, devices, pages, browsers)                                            |
| **Google Search Console** | OAuth (same as GA4)                         | Search queries, clicks, impressions, CTR, avg position (90 days)                                                            |
| **Stripe**                | Restricted API key (per-website)            | Daily revenue, refunds, charges, new customers (90 days)                                                                    |
| **PostHog**               | Personal API key + Project ID (per-website) | Pageviews, visitors, sessions, bounce rate, duration, countries, cities, devices, browsers, OS, pages, referrers (365 days) |
| **Sitemap / IndexNow**    | Auto-generated key (per-website)            | Pushes new URLs to Google Indexing API and IndexNow (Bing, Yandex, …) whenever the sitemap changes                          |

Google Analytics and Search Console share a single OAuth connection — one "Connect with Google" click grants access to both.

Each integration is configured in **Website Settings → Integrations** tab. Cloudflare and Google credentials are set in **Settings → Integrations** (global). Stripe and PostHog are configured per-website.

All imports use source-specific prefixes (`import-cf-`, `import-ga-`, `import-ph-`) so multiple integrations can coexist without overwriting each other. Re-syncing only replaces data from its own source.

---

## Tech Stack

| Layer                 | Technology                                                                                                                                                                       |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Runtime               | [Bun 1.3](https://bun.com) — both API and worker run on native Bun                                                                                                               |
| API                   | [Hono 4](https://hono.dev) — ingest + `/api/auth` + `/api/trpc` mounted in one Bun.serve                                                                                         |
| Frontend              | [TanStack Start](https://tanstack.com/start) + [TanStack Router](https://tanstack.com/router) (file-based, SSR, typed search params) with a Bun wrapper serving static + SSR + `/api/*` proxy |
| Language              | TypeScript 6 (strict)                                                                                                                                                            |
| Typed RPC             | [tRPC v11](https://trpc.io) + [TanStack Query v5](https://tanstack.com/query) — 26 routers shared via `workspace:*` type export                                                  |
| Database              | PostgreSQL 17 + [TimescaleDB](https://www.timescale.com) via [Drizzle ORM](https://orm.drizzle.team) — hypertables auto-partition time-series tables for fast queries at scale   |
| Connection pool       | [PgBouncer](https://www.pgbouncer.org) in transaction mode (20 pool, 1000 max clients)                                                                                           |
| Cache / Queue         | [Dragonfly](https://www.dragonflydb.io) (Redis-compatible, 25x faster) — real-time, rate limits, tracking queue, workflow queue                                                  |
| Auth                  | JWT sessions (HS256 via [jose](https://github.com/panva/jose)) + bcryptjs — a ~200-line Hono module on the `users` table, no NextAuth                                            |
| UI Components         | [shadcn/ui](https://ui.shadcn.com) + [Radix UI](https://www.radix-ui.com) primitives + [base-ui](https://base-ui.com)                                                            |
| Icons                 | [Tabler Icons](https://tabler.io/icons) + [Lucide](https://lucide.dev)                                                                                                           |
| Styling               | [Tailwind CSS v4](https://tailwindcss.com) + `tw-animate-css`                                                                                                                    |
| Toasts                | [sileo](https://www.npmjs.com/package/sileo)                                                                                                                                     |
| Charts                | Custom visx-based charts (Area, Bar, Ring) + [Recharts](https://recharts.org) sparklines                                                                                         |
| Maps                  | [MapLibre GL](https://maplibre.org) + [MapCN](https://www.mapcn.dev) tiles + [MaxMind GeoIP2](https://www.maxmind.com)                                                           |
| AI                    | [OpenAI](https://platform.openai.com) (GPT-5.4), [Anthropic](https://anthropic.com) (Claude Sonnet/Opus 4.6), [Google](https://ai.google.dev) (Gemini 3.1 Flash Lite)            |
| Forms                 | [React Hook Form](https://react-hook-form.com) + [Zod](https://zod.dev) validation                                                                                               |
| Theme                 | [next-themes](https://github.com/pacocoursey/next-themes) (runtime-agnostic despite the name)                                                                                    |
| Build                 | [Vite 7](https://vitejs.dev) + [Rollup 4](https://rollupjs.org) for the frontend; Bun's runtime TS for api + worker                                                              |
| Linter                | [oxlint](https://oxc.rs) — Rust-based, catches `no-undef` type bugs before they hit production                                                                                   |
| Deployment            | Docker Compose → [Coolify](https://coolify.io) with Traefik v3                                                                                                                   |

---

## Project Structure

pnpm workspaces monorepo. Three deployable apps share two internal packages:

```
apps/
├── api/                          # Hono + Bun — HTTP surface (port 3001)
│   ├── src/
│   │   ├── index.ts              # Bun.serve entry: CORS, heartbeats, route mounts
│   │   ├── routes/               # Hono route modules
│   │   │   ├── collect.ts        # POST /api/collect — main tracker ingest (queue-first)
│   │   │   ├── batch.ts          # POST /api/batch — 25-event batch
│   │   │   ├── track/            # /api/track/{pageview,event,session,conversion}
│   │   │   ├── vitals.ts         # POST /api/vitals — Web Vitals (LCP/FCP/INP/CLS/TTFB)
│   │   │   ├── websites-config.ts # GET /api/websites/config/:trackingCode
│   │   │   ├── health.ts         # GET /api/health
│   │   │   ├── auth.ts           # /api/auth/{signin,signout,session,signup}
│   │   │   ├── trpc.ts           # /api/trpc/* via @trpc/server/adapters/fetch
│   │   │   └── ai-chat.ts        # POST /api/ai-chat — streaming OpenAI/Anthropic/Google
│   │   ├── lib/
│   │   │   ├── session.ts        # getSession(req) — JWT cookie → users row
│   │   │   ├── jwt.ts            # jose HS256 sign/verify
│   │   │   ├── cookies.ts        # httpOnly + SameSite cookie helpers
│   │   │   └── rate-limit-mw.ts  # Hono middleware (fail-open on Redis outage)
│   │   ├── trpc/
│   │   │   ├── trpc.ts           # initTRPC, context, protected/public procedures
│   │   │   ├── root.ts           # appRouter — merges 26 subrouters
│   │   │   └── routers/          # one per domain: analytics, websites, goals,
│   │   │       └── integrations/ # cloudflare, google-analytics, search-console,
│   │   │                         # stripe, posthog
│   │   └── workflows/            # sitemap-indexing + uptime-monitor helpers
│   └── Dockerfile                # node:alpine install → bun:alpine runtime
│
├── worker/                       # Bun — background consumer
│   ├── src/
│   │   ├── index.ts              # BRPOP loops + graceful shutdown
│   │   ├── scheduler.ts          # setInterval: uptime scan (5m) + sitemap poll (6h)
│   │   └── workflows/
│   │       ├── uptime.ts         # runUptimeCheckForSite + scanEnabledUptimeSites
│   │       └── sitemap.ts        # runSitemapPollForSite + scanAutoIndexSites
│   └── Dockerfile
│
├── web/                          # TanStack Start + Vite 7
│   ├── src/
│   │   ├── client.tsx            # hydrateRoot + StartClient (explicit — avoids a
│   │   │                         # TanStack Start codegen bug where React.*
│   │   │                         # references didn't survive minification)
│   │   ├── router.tsx            # getRouter() — QueryClient + tRPC provider wrap
│   │   ├── routes/               # file-based: _app.* is the authed layout,
│   │   │   │                     # _app.<name>.tsx + _app.<name>.index.tsx pattern
│   │   │   │                     # when a path is both a parent and a leaf
│   │   │   ├── __root.tsx        # <html> + ThemeProvider + Toaster
│   │   │   ├── _app.tsx          # auth guard + sidebar + header
│   │   │   ├── auth.signin.tsx
│   │   │   ├── _app.dashboard.tsx, _app.realtime.tsx, _app.analytics.tsx,
│   │   │   ├── _app.goals.tsx, _app.users.tsx, _app.admin.tsx, _app.ai.tsx,
│   │   │   ├── _app.settings.tsx, _app.speed-insights.tsx, _app.docs.tsx,
│   │   │   ├── _app.reports.tsx, _app.custom-reports.tsx,
│   │   │   └── _app.websites.* (index, new, $id, $id.settings)
│   │   ├── components/
│   │   │   ├── ui/               # shadcn/base-ui primitives
│   │   │   ├── layout/           # AppLayout + AppSidebar + Header
│   │   │   ├── auth/             # SignInForm + SignUpForm
│   │   │   ├── charts/           # visx Area/Bar/Ring + tooltips
│   │   │   ├── ai-elements/      # Conversation, Message, Reasoning, …
│   │   │   └── icons/            # CF, GA, Google, Stripe, PostHog, Telegram
│   │   └── lib/
│   │       ├── trpc.ts           # createTRPCReact<AppRouter> (type from apps/api)
│   │       ├── auth.ts           # useSession / useSignIn / useSignOut
│   │       └── export-helpers.ts # CSV/JSON/Excel
│   ├── server-prod.js            # Bun wrapper: static assets + /_health + /api/* proxy + SSR
│   └── Dockerfile
│
packages/
├── db/                           # @ninelytics/db — Drizzle schema + createDb() factory
│   └── src/{schema.ts,client.ts}
└── shared/                       # @ninelytics/shared — runtime-agnostic utilities
    └── src/
        ├── db.ts                 # Lazy Proxy singleton around @ninelytics/db
        ├── collect.ts            # Runtime-agnostic processEvent pipeline
        ├── rate-limiter.ts       # Redis INCR + expire
        ├── tracking-queue.ts     # BRPOP/LPUSH wrapper for tracking:jobs
        ├── workflow-queue.ts     # Same pattern for jobs:workflow (ad-hoc triggers)
        ├── tracking-helpers.ts   # upsertVisitor / upsertSession / updateSessionMetrics
        ├── tracking-conversion.ts # Goal matching + conversion insert
        ├── geolocation.ts        # MaxMind + ip-api.com fallback (bounded LRU cache)
        ├── redis.ts              # ioredis client + realtime helpers
        ├── bot-detection.ts      # isbot
        ├── ip-filter.ts          # IP denylist from env
        ├── maxmind-updater.ts    # Downloads GeoLite2-City.mmdb on boot
        ├── cloudflare-analytics.ts, google-analytics.ts, google-oauth.ts,
        │   search-console.ts, stripe-api.ts, posthog-api.ts — integration clients
        ├── telegram.ts, email.ts (Resend), sms.ts (Twilio) — notifications
        ├── ai-service.ts         # OpenAI insights + cache
        ├── ai-analytics.ts       # Anomaly detection + predictions + recommendations
        └── emails/uptime-alert.tsx # React Email template

scripts/
└── api-entrypoint.sh             # drizzle-kit push + TimescaleDB hypertable setup,
                                  # then execs the api. Replaces the old db-migrate one-shot.

docker-compose.yml                # postgres + pgbouncer + dragonfly + api + worker + web
drizzle.config.ts                 # points at packages/db/src/schema.ts
```

`apps/web` depends on `@ninelytics/api` only for the **type** of `AppRouter` — tRPC procedure types flow to the frontend at zero runtime cost. No server code ever ends up in the client bundle.

---

## Getting Started

### Prerequisites

- [Bun](https://bun.com) 1.3+ (runtime for api + worker + web build output)
- [Node.js](https://nodejs.org) 22+ (used only to run `pnpm install` — Bun can run everything else)
- [pnpm](https://pnpm.io) 10+ (workspace manager)
- PostgreSQL 17 with the [TimescaleDB](https://www.timescale.com) extension
- Redis / Dragonfly

### Installation

```bash
git clone https://github.com/ninedotdev/ninelytics.git
cd ninelytics
pnpm install     # hydrates all workspaces (apps/* + packages/*)
```

### Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```env
# ─── Required ───
DATABASE_URL="postgresql://user:password@localhost:5432/analytics"
REDIS_URL="redis://localhost:6379"
SESSION_SECRET="generate-a-random-secret"
APP_URL="http://localhost:3000"

# ─── AI Models (at least one required for AI Insights) ───
OPENAI_API_KEY=""           # GPT-5.4, GPT-5.3, GPT-5.4 Mini
ANTHROPIC_API_KEY=""        # Claude Sonnet 4.6, Claude Opus 4.6
GOOGLE_AI_API_KEY=""        # Gemini 3.1 Flash Lite

# ─── Google OAuth (for GA4 + Search Console + Indexing API) ───
GOOGLE_API_CLIENT_ID=""
GOOGLE_API_CLIENT_SECRET=""

# ─── GeoIP (for visitor maps) ───
MAXMIND_LICENSE_KEY=""
MAXMIND_DB_PATH="/var/data/GeoLite2-City.mmdb"

# ─── Uptime Notifications (all optional) ───
# RESEND_API_KEY=""              # Email alerts via Resend
# RESEND_FROM_EMAIL=""           # e.g. alerts@yourdomain.com
# TWILIO_ACCOUNT_SID=""          # SMS alerts via Twilio
# TWILIO_AUTH_TOKEN=""
# TWILIO_PHONE_NUMBER=""
# Telegram is configured per-user in Settings → Integrations (no env var needed)

# ─── Seed (optional) ───
# SEED_ADMIN_EMAIL="admin@localhost"
# SEED_ADMIN_PASSWORD="changeme"

# ─── Multi-Tenant / SaaS Mode (optional) ───
# IS_MULTI_TENANT="false"
# STRIPE_SECRET_KEY=""
# STRIPE_WEBHOOK_SECRET=""
# STRIPE_PRICE_ID_PRO=""
# STRIPE_PRICE_ID_ENTERPRISE=""
```

### Database Setup

```bash
# Push schema to the database (drizzle-kit reads packages/db/src/schema.ts)
pnpm drizzle:push
```

The first time the api container boots, `scripts/api-entrypoint.sh` also runs `drizzle-kit push` + the TimescaleDB hypertable setup automatically — so in Docker deploys you don't need to run this manually.

### Development

Run each app in its own terminal so they can hot-reload independently:

```bash
# Terminal 1 — API (Hono + Bun, port 3001)
pnpm --filter @ninelytics/api dev

# Terminal 2 — Worker (Bun)
pnpm --filter @ninelytics/worker dev

# Terminal 3 — Frontend (TanStack Start + Vite, port 3000)
pnpm --filter @ninelytics/web dev
```

Open [http://localhost:3000](http://localhost:3000) — it redirects to `/dashboard`. `/api/*` is proxied to the api on :3001 by Vite's dev server, so cookies and tRPC calls work same-origin.

---

## Tracking Script

Add this snippet to any website you want to track:

```html
<script
  async
  src="https://your-domain.com/tracker.js"
  data-tracking-code="YOUR_TRACKING_CODE"
></script>
```

The tracker automatically captures pageviews, sessions, scroll depth, rage clicks, and performance metrics.

**Custom events:**

```js
window.analytics.track("purchase", { amount: 49.99, plan: "pro" });
```

**Conversion goals:**

```js
window.analytics.goal("signup", 1);
```

### Analytics Consent Banner

The tracker includes a built-in GDPR consent banner. Enable it in website settings → Consent tab.

When enabled:

- No tracking occurs until the user explicitly accepts
- No cookies, localStorage, or network requests before consent
- Banner renders in Shadow DOM (no style conflicts with your site)
- Consent is saved in `localStorage` and remembered on return visits
- Supports granular categories: Necessary (always on), Analytics, Marketing, Preferences

```js
// Check consent status programmatically
window.analytics.consent();

// Reset consent and show banner again
window.analytics.resetConsent();
```

Configure the banner in **Website Settings → Consent** tab.

---

## Scripts

```bash
pnpm drizzle:push                           # drizzle-kit push against $DATABASE_URL
pnpm drizzle:generate                       # generate a migration SQL file
pnpm typecheck                              # tsc --noEmit across all workspaces
pnpm lint                                   # oxlint on apps/web (fast, Rust-based)

pnpm --filter @ninelytics/api dev           # Hono + Bun dev with --hot
pnpm --filter @ninelytics/worker dev        # Bun worker with --hot
pnpm --filter @ninelytics/web dev           # Vite dev server (port 3000, /api proxied)

pnpm --filter @ninelytics/web build         # production bundle → apps/web/dist/
pnpm --filter @ninelytics/api typecheck     # per-app typecheck
```

---

## Timezone

The platform uses **browser-detected timezones** — each user sees stats ("Visitors Today", "Last 7 Days", etc.) in their own local timezone. The browser timezone is detected automatically via `Intl.DateTimeFormat().resolvedOptions().timeZone` and sent with each API request.

**How it works:**

- The tracking script always stores timestamps in **UTC** in the database
- When querying stats, the client sends its timezone (e.g. `America/New_York`) as a parameter
- PostgreSQL converts timestamps using `AT TIME ZONE` at query time
- Each user sees data grouped by their local day boundaries

No `TZ` environment variable is needed. A user in New York sees "today" as Eastern Time, while a user in Tokyo sees "today" as JST — from the same data.

If no timezone can be detected, the fallback is `America/New_York`.

---

## Sitemap & Indexing

Enable automatic indexing from **Website Settings → Indexing** tab. Once enabled, a durable background workflow polls your sitemap every 6 hours and submits new URLs to search engines.

### How it works

1. The scheduler fetches your sitemap XML and diffs it against known URLs stored in the database.
2. **New URLs** are submitted to IndexNow immediately (batch, no rate limit).
3. **All pending URLs** are checked against the Google URL Inspection API first — already-indexed pages are marked `indexed` without consuming Indexing API quota.
4. Pages not yet indexed are submitted to the Google Indexing API one at a time, with an 8-minute sleep between submissions to respect the 200 requests/day quota.
5. Stats are updated in real time and visible in the settings card.

### URL statuses

| Status      | Meaning                                      |
| ----------- | -------------------------------------------- |
| `pending`   | In the sitemap, not yet checked or submitted |
| `submitted` | Sent to Google Indexing API, awaiting crawl  |
| `indexed`   | Confirmed indexed via URL Inspection API     |
| `error`     | Submission failed (retried on next run)      |

### Google — required setup

The Google integration requires **three** things before indexing works:

1. **Google OAuth connected** — click "Connect with Google" in Settings → Integrations. This grants access to Analytics, Search Console, and the Indexing API in one flow.

2. **Required Google Cloud APIs enabled** — in your [Google Cloud Console](https://console.cloud.google.com) project, enable:
   - Google Search Console API
   - Web Search Indexing API ← **required for Indexing API submissions**
   - (Google Analytics Data API — if using GA4 import)

3. **Verified Owner in Search Console** — your site must be verified as a **Verified Owner** (not just a user) in [Google Search Console](https://search.google.com/search-console). The Indexing API only accepts submissions from verified owners. Domain-level verification (DNS TXT record) is the most reliable method.

> Without Verified Owner status, Indexing API calls return HTTP 403 even with a valid OAuth token and the correct scope.

**OAuth scope required:** `https://www.googleapis.com/auth/indexing` — this is automatically requested during the "Connect with Google" flow.

### IndexNow setup

IndexNow notifies Bing, Yandex, and other participating engines of new content instantly. To enable it:

1. Toggle **IndexNow** on in Website Settings → Indexing. A unique key is auto-generated.
2. Host the key file at `https://your-domain.com/<key>.txt` with the key as the file contents.
3. Click **Verify Key** — the platform fetches the file and confirms it matches.

Once verified, any new URL found in your sitemap is submitted to IndexNow in the same run.

### Automated workflow

The background workflow handles everything without manual intervention:

- Runs automatically every **6 hours** to pick up sitemap changes.
- When submitting to Google, it waits **8 minutes between each URL** to stay within the default 200 requests/day quota. This means ~180 URLs can be processed per day at the default limit.
- If a URL was already indexed (detected via URL Inspection API), it is marked `indexed` and skipped — no Indexing API request consumed.
- URLs that errored on a previous run are automatically reset to `pending` and retried on the next workflow run.
- You can also trigger a manual check at any time from **Website Settings → Indexing → Check Now**.

### Quota notes

- **Google Indexing API** — 200 requests/day by default. You can request a quota increase in [Google Cloud Console → APIs & Services → Quotas](https://console.cloud.google.com/apis/api/indexing.googleapis.com/quotas). Once granted, the 8-minute sleep interval can be adjusted accordingly.
- **URL Inspection API** — 2,000 requests/day. Already-indexed URLs are detected here and skip the Indexing API entirely.
- **IndexNow** — no quota limit.

---

## Deployment

### Docker Compose (recommended)

The included `docker-compose.yml` runs **six services**: `postgres`, `pgbouncer`, `dragonfly`, `api`, `worker`, and `web`. Schema migrations run inline in the api's entrypoint — no separate one-shot container.

```bash
# 1. Copy and configure environment
cp docker.env.example .env
# Edit .env — set at minimum: DB_PASSWORD, SESSION_SECRET, APP_URL

# 2. Start everything
docker compose up -d

# 3. (First run only) Create the first user
# Hit POST https://<your-host>/api/auth/signup — or use /auth/signup in the browser.
# Single-tenant mode auto-allows the first signup as OWNER.
```

Open `http://localhost:3000`.

**Architecture:**

```
Traefik → :3000 → [web] → /api/* → [api:3001] → :6432 → [pgbouncer] → :5432 → [postgres]
                                              → :6379 → [dragonfly] ← [worker] (tracking + workflow queues + scheduler)
```

- **web** (TanStack Start on Bun) — SSR + static assets + reverse-proxy of `/api/*` to the api container over the internal docker network. Exposes 3000.
- **api** (Hono on Bun) — ingest endpoints, tRPC, auth, AI chat streaming. Runs `scripts/api-entrypoint.sh` on boot: drizzle-kit push + TimescaleDB hypertable setup, then exec's the server. Exposes 3001.
- **worker** (Bun) — BRPOP loops on `tracking:jobs` and `jobs:workflow`, plus a setInterval scheduler that scans uptime (every 5 min) and sitemap auto-index sites (every 6 h). Graceful shutdown on SIGINT/SIGTERM.
- **pgbouncer** — connection pooler in transaction mode (20 pool size, 1000 max clients). The api sets `prepare: false` on its postgres client to be safe under transaction pooling.
- **dragonfly** — Redis-compatible in-memory store (512 MB max). Backs real-time analytics, rate limits, tracking queue, workflow queue.
- **postgres 17 + TimescaleDB** — hypertables on `page_views`, `events`, `uptime_checks`, `web_vitals`.

Healthchecks are aggressive (3 s interval on `web`, start_period 90 s on `api`) so Traefik/Coolify routes traffic as soon as the server actually accepts it — post-deploy 504 windows are seconds, not minutes.

### Coolify

1. **New Resource** → select your Git repository
2. In **Build Pack**, choose **Docker Compose**
3. In **Docker Compose Location**, enter `docker-compose.yml`
4. Point your FQDN at the `web` service (port 3000). The `/api/*` proxy is built into `web/server-prod.js`, so a single hostname covers the frontend and all API endpoints.
5. Add environment variables in the Coolify UI — see `docker.env.example` for the full list. Minimum:
   - `DB_PASSWORD`, `SESSION_SECRET`, `APP_URL`
   - Optional: `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_AI_API_KEY` (AI Insights), `MAXMIND_LICENSE_KEY` (geo maps), `RESEND_API_KEY` / `TWILIO_*` (uptime alerts), `GOOGLE_API_CLIENT_ID` + `GOOGLE_API_CLIENT_SECRET` (GA4 + Search Console).
6. Deploy — Coolify builds the images, runs drizzle-kit push during api startup, and starts serving.

### Manual (without Docker)

```bash
# Prereqs: Bun 1.3, Node 22, pnpm 10, PostgreSQL 17 + TimescaleDB, Redis/Dragonfly.
pnpm install
pnpm drizzle:push

# Terminal 1 — API
cd apps/api && bun run src/index.ts
# Terminal 2 — Worker
cd apps/worker && bun run src/index.ts
# Terminal 3 — Web (build + serve)
cd apps/web && pnpm build && bun run server-prod.js
```

Set all environment variables from `docker.env.example` before starting.

---

Made by [9th Avenue](https://the9thave.com)
