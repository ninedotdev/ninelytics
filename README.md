# Ninelytics

A self-hosted, privacy-first web analytics platform built with Next.js. Track pageviews, events, sessions, and conversions across multiple websites from a single dashboard — with real-time data, AI-powered insights, geo-location maps, custom reports, and goal tracking.

![Dashboard](public/repo/dashboard.png)

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

---

## Integrations

All integrations are optional and configured from the Settings page (credentials) and per-website settings (linking). Historical data merges with live tracking — no gaps when migrating.

| Integration | Auth method | What it imports |
|---|---|---|
| **Cloudflare** | API Token (per-user) | Historical pageviews, visitors, top countries/devices/pages/browsers |
| **Google Analytics 4** | OAuth (per-user) | Historical pageviews, visitors, breakdowns (countries, devices, pages, browsers) |
| **Google Search Console** | OAuth (same as GA4) | Search queries, clicks, impressions, CTR, avg position (90 days) |
| **Stripe** | Restricted API key (per-website) | Daily revenue, refunds, charges, new customers (90 days) |
| **PostHog** | Personal API key + Project ID (per-website) | Pageviews, visitors, sessions, bounce rate, duration, countries, cities, devices, browsers, OS, pages, referrers (365 days) |
| **Sitemap / IndexNow** | Auto-generated key (per-website) | Pushes new URLs to Google Indexing API and IndexNow (Bing, Yandex, …) whenever the sitemap changes |

Google Analytics and Search Console share a single OAuth connection — one "Connect with Google" click grants access to both.

Each integration is configured in **Website Settings → Integrations** tab. Cloudflare and Google credentials are set in **Settings → Integrations** (global). Stripe and PostHog are configured per-website.

All imports use source-specific prefixes (`import-cf-`, `import-ga-`, `import-ph-`) so multiple integrations can coexist without overwriting each other. Re-syncing only replaces data from its own source.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | [Next.js 16](https://nextjs.org) (App Router, Turbopack) |
| Language | TypeScript 6 (strict) |
| API | [tRPC v11](https://trpc.io) + [TanStack Query v5](https://tanstack.com/query) |
| Database | PostgreSQL via [Drizzle ORM](https://orm.drizzle.team) |
| Cache / Rate limiting | Redis via [ioredis](https://github.com/redis/ioredis) |
| Auth | [NextAuth.js v4](https://next-auth.js.org) with Drizzle adapter |
| UI Components | [shadcn/ui](https://ui.shadcn.com) + [Radix UI](https://www.radix-ui.com) primitives |
| Icons | [Tabler Icons](https://tabler.io/icons) |
| Styling | [Tailwind CSS v4](https://tailwindcss.com) |
| Charts | Custom visx-based charts (Area, Bar, Ring) + [Recharts](https://recharts.org) sparklines |
| Maps | [MapLibre GL](https://maplibre.org) + [MapCN](https://www.mapcn.dev) tiles + [MaxMind GeoIP2](https://www.maxmind.com) |
| AI | [OpenAI](https://platform.openai.com) (GPT-5.4), [Anthropic](https://anthropic.com) (Claude Sonnet/Opus 4.6), [Google](https://ai.google.dev) (Gemini 3.1 Flash Lite) |
| Forms | [React Hook Form](https://react-hook-form.com) + [Zod](https://zod.dev) validation |
| State | [Zustand](https://zustand-demo.pmnd.rs) + [SWR](https://swr.vercel.app) |
| Deployment | [Coolify](https://coolify.io) (self-hosted) |

---

## Project Structure

```
src/
├── app/
│   ├── dashboard/          # Main overview with geo map
│   ├── analytics/          # Pageviews, sessions, events breakdown
│   ├── realtime/           # Live visitor feed
│   ├── websites/           # Website management + per-site settings
│   ├── custom-reports/     # Builder + saved reports
│   ├── goals/              # Conversion goal tracking
│   ├── ai/                 # AI-powered data Q&A
│   ├── users/              # User & team management
│   ├── settings/           # Account settings + integrations
│   └── api/
│       ├── trpc/           # tRPC handler
│       ├── track/          # Tracking endpoints (pageview, event, session, conversion)
│       ├── batch/          # Batch event collection
│       ├── google/         # Google OAuth flow (auth + callback)
│       └── websites/config # Public config endpoint (excluded paths + consent)
├── server/
│   ├── db/
│   │   ├── schema.ts       # Drizzle schema (users, websites, events, sessions, search_console_data, stripe_data…)
│   │   └── client.ts       # Drizzle + postgres client
│   └── api/
│       └── routers/
│           ├── websites.ts           # Core website CRUD + stats
│           ├── analytics.ts          # Analytics overview, pages, devices, traffic
│           ├── integrations/         # Integration routers (one per service)
│           │   ├── cloudflare.ts     # CF import (import-cf-*)
│           │   ├── google-analytics.ts # GA4 import + OAuth (import-ga-*)
│           │   ├── search-console.ts # Search Console import
│           │   ├── stripe.ts        # Stripe revenue import
│           │   └── posthog.ts       # PostHog import (import-ph-*)
│           └── helpers/
│               └── ensure-access.ts  # Shared website access check
├── lib/
│   ├── cloudflare-analytics.ts  # CF GraphQL API client
│   ├── google-analytics.ts      # GA4 Data API client
│   ├── google-oauth.ts          # Google OAuth token management
│   ├── search-console.ts        # Search Console API client
│   ├── stripe-api.ts            # Stripe API client (read-only)
│   ├── posthog-api.ts           # PostHog HogQL Query API client
│   ├── country-names.ts         # Country ISO ↔ name normalization
│   ├── geolocation.ts           # GeoIP (MaxMind + ip-api fallback)
│   ├── timezone.ts              # Timezone SQL helpers
│   └── export-helpers.ts        # CSV/JSON/Excel export
├── hooks/
│   └── use-timezone.ts          # Client timezone detection
├── components/
│   ├── ui/                 # shadcn + custom primitives (map, charts…)
│   ├── icons/              # Brand icons (Cloudflare, GA, Google, Stripe, PostHog)
│   ├── analytics/          # Advanced filters
│   └── layout/             # App shell, sidebar, nav
└── public/
    └── analytics.js        # Client tracking script + consent banner
```

---

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm
- PostgreSQL
- Redis

### Installation

```bash
git clone https://github.com/ninedotdev/ninelytics.git
cd ninelytics
pnpm install
```

### Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```env
# ─── Required ───
DATABASE_URL="postgresql://user:password@localhost:5432/analytics"
REDIS_URL="redis://localhost:6379"
NEXTAUTH_URL="http://localhost:3000"
NEXTAUTH_SECRET="generate-a-random-secret"
JWT_SECRET="generate-a-random-secret"
NEXT_PUBLIC_APP_URL="http://localhost:3000"

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
# Push schema to database
pnpm drizzle:push

# Seed initial data
pnpm db:seed
```

### Development

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) — it redirects to `/dashboard`.

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
window.analytics.track('purchase', { amount: 49.99, plan: 'pro' })
```

**Conversion goals:**
```js
window.analytics.goal('signup', 1)
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
window.analytics.consent()

// Reset consent and show banner again
window.analytics.resetConsent()
```

Configure the banner in **Website Settings → Consent** tab.

---

## Scripts

```bash
pnpm dev               # Start dev server (Turbopack)
pnpm build             # Production build
pnpm start             # Start production server
pnpm lint              # Lint
pnpm drizzle:generate  # Generate migrations
pnpm drizzle:push      # Push schema to DB
pnpm db:seed           # Seed database
pnpm db:reset-seed     # Reset and re-seed
pnpm db:maxmind        # Download MaxMind GeoIP database
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

| Status | Meaning |
|---|---|
| `pending` | In the sitemap, not yet checked or submitted |
| `submitted` | Sent to Google Indexing API, awaiting crawl |
| `indexed` | Confirmed indexed via URL Inspection API |
| `error` | Submission failed (retried on next run) |

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

The included `docker-compose.yml` runs the full stack: **PostgreSQL 17 + PgBouncer + Dragonfly (Redis) + Next.js app**.

```bash
# 1. Copy and configure environment
cp docker.env.example .env
# Edit .env — set at minimum: DB_PASSWORD, NEXTAUTH_SECRET, APP_URL

# 2. Start everything
docker compose up -d

# 3. (First run only) Seed the admin user
docker compose exec app npx tsx scripts/seed.ts
```

Open `http://localhost:3000` — login with the seed credentials.

**Architecture:**
```
Client → :3000 → [app] → :6432 → [pgbouncer] → :5432 → [postgres]
                       → :6379 → [dragonfly]
```

- **PgBouncer** — connection pooler in transaction mode (20 pool size, 1000 max clients). Eliminates per-request connection overhead.
- **Dragonfly** — Redis-compatible in-memory store, 25x faster than Redis. Handles real-time analytics, notifications, rate limiting.
- **Schema migrations** run automatically on startup via `drizzle-kit push`.

### Coolify

1. **New Resource** → select your Git repository
2. In **Build Pack**, choose **Docker Compose**
3. In **Docker Compose Location**, enter `docker-compose.yml`
4. Add environment variables in the Coolify UI:
   - `DB_PASSWORD`, `NEXTAUTH_SECRET`, `APP_URL` (required)
   - `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `GOOGLE_AI_API_KEY` (optional, for AI)
   - See `docker.env.example` for all options
5. Deploy — Coolify builds the image, starts all 4 services (PostgreSQL, PgBouncer, Dragonfly, App)

### Manual (without Docker)

```bash
# Prerequisites: Node 22+, pnpm, PostgreSQL, Redis/Dragonfly
pnpm install
pnpm build
pnpm drizzle:push
pnpm db:seed
pnpm start
```

Set all environment variables from `.env.example` before starting.

---

Made by [9th Avenue](https://the9thave.com)
