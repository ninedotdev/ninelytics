import { websitesRouter } from "./routers/websites"
import { trackingRouter } from "./routers/tracking"
import { analyticsRouter } from "./routers/analytics"
import { goalsRouter } from "./routers/goals"
import { dashboardRouter } from "./routers/dashboard"
import { usersRouter } from "./routers/users"
import { settingsRouter } from "./routers/settings"
import { notificationsRouter } from "./routers/notifications"
import { realtimeRouter } from "./routers/realtime"
import { customReportsRouter } from "./routers/custom-reports"
import { aiRouter } from "./routers/ai"
import { adminRouter } from "./routers/admin"
import { searchRouter } from "./routers/search"
import { cloudflareRouter } from "./routers/integrations/cloudflare"
import { googleAnalyticsRouter } from "./routers/integrations/google-analytics"
import { searchConsoleRouter } from "./routers/integrations/search-console"
import { stripeRouter as stripeIntegrationRouter } from "./routers/integrations/stripe"
import { posthogRouter } from "./routers/integrations/posthog"
import { funnelsRouter } from "./routers/funnels"
import { authRouter } from "./routers/auth"
import { organizationsRouter } from "./routers/organizations"
import { sitemapRouter } from "./routers/sitemap"
import { speedInsightsRouter } from "./routers/speed-insights"
import { uptimeRouter } from "./routers/uptime"
import { sessionsRouter } from "./routers/sessions"
import { router } from "./trpc"

export const appRouter = router({
  websites: websitesRouter,
  cloudflare: cloudflareRouter,
  googleAnalytics: googleAnalyticsRouter,
  searchConsole: searchConsoleRouter,
  stripe: stripeIntegrationRouter,
  posthog: posthogRouter,
  tracking: trackingRouter,
  analytics: analyticsRouter,
  goals: goalsRouter,
  funnels: funnelsRouter,
  dashboard: dashboardRouter,
  users: usersRouter,
  settings: settingsRouter,
  notifications: notificationsRouter,
  realtime: realtimeRouter,
  customReports: customReportsRouter,
  ai: aiRouter,
  admin: adminRouter,
  search: searchRouter,
  auth: authRouter,
  organizations: organizationsRouter,
  sitemap: sitemapRouter,
  speedInsights: speedInsightsRouter,
  uptime: uptimeRouter,
  sessions: sessionsRouter,
})

export type AppRouter = typeof appRouter

