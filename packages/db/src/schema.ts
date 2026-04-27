import { sql } from "drizzle-orm"
import {
  boolean,
  date,
  decimal,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core"

export const userRoleEnum = pgEnum("UserRole", ["ADMIN", "OWNER", "VIEWER"])
export const websiteStatusEnum = pgEnum("WebsiteStatus", ["ACTIVE", "INACTIVE", "PENDING"])
export const accessLevelEnum = pgEnum("AccessLevel", ["READ", "WRITE", "ADMIN"])
export const goalTypeEnum = pgEnum("GoalType", ["PAGEVIEW", "EVENT", "DURATION", "REVENUE", "SEARCH_POSITION", "SEARCH_CLICKS"])

// Workflow library enum types — declared here so drizzle-kit doesn't try to drop them
export const workflowStatusEnum = pgEnum("status", ["pending", "running", "completed", "failed", "cancelled"])
export const workflowStepStatusEnum = pgEnum("step_status", ["pending", "running", "completed", "failed", "cancelled"])
export const workflowWaitStatusEnum = pgEnum("wait_status", ["waiting", "completed"])

export const users = pgTable("users", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  name: text("name"),
  email: text("email").notNull(),
  emailVerified: timestamp("email_verified", { mode: "string" }),
  image: text("image"),
  bio: text("bio"),
  password: text("password"),
  role: userRoleEnum("role").default("OWNER").notNull(),
  isSuperAdmin: boolean("is_super_admin").default(false).notNull(),
  cloudflareApiToken: text("cloudflare_api_token"),
  googleAnalyticsCredentials: text("google_analytics_credentials"),
  googleAccessToken: text("google_access_token"),
  googleRefreshToken: text("google_refresh_token"),
  googleTokenExpiresAt: timestamp("google_token_expires_at", { mode: "string" }),
  googleScopes: text("google_scopes"),
  // Notification preferences (uptime + future channels)
  phoneNumber: text("phone_number"),
  telegramChatId: text("telegram_chat_id"),
  telegramBotToken: text("telegram_bot_token"),
  notifyOnDown: boolean("notify_on_down").default(true),
  notifyOnRecovered: boolean("notify_on_recovered").default(true),
  notifyOnDegraded: boolean("notify_on_degraded").default(false),
  notifyOnSslExpiry: boolean("notify_on_ssl_expiry").default(true),
  notifyOnContentChange: boolean("notify_on_content_change").default(false),
  notifyViaApp: boolean("notify_via_app").default(true),
  notifyViaEmail: boolean("notify_via_email").default(true),
  notifyViaSms: boolean("notify_via_sms").default(false),
  notifyViaTelegram: boolean("notify_via_telegram").default(false),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
}, (table) => ({
  emailKey: uniqueIndex("users_email_key").on(table.email),
}))

export const accounts = pgTable(
  "accounts",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refreshToken: text("refresh_token"),
    accessToken: text("access_token"),
    expiresAt: integer("expires_at"),
    tokenType: text("token_type"),
    scope: text("scope"),
    idToken: text("id_token"),
    sessionState: text("session_state"),
    createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
  },
  (table) => ({
    providerProviderAccountIdKey: uniqueIndex("accounts_provider_provider_account_id_key").on(
      table.provider,
      table.providerAccountId
    ),
  })
)

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    sessionToken: text("session_token").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expires: timestamp("expires", { mode: "string" }).notNull(),
    createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
  },
  (table) => ({
    sessionTokenKey: uniqueIndex("sessions_session_token_key").on(table.sessionToken),
  })
)

export const verificationTokens = pgTable(
  "verification_tokens",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "string" }).notNull(),
  },
  (table) => ({
    compositePk: primaryKey({ columns: [table.identifier, table.token] }),
    tokenKey: uniqueIndex("verification_tokens_token_key").on(table.token),
  })
)

export const mvWebsiteDailyStats = pgTable(
  "mv_website_daily_stats",
  {
    websiteId: text("website_id").notNull(),
    date: date("date").notNull(),
    uniqueVisitors: integer("unique_visitors").notNull(),
    pageViews: integer("page_views").notNull(),
    sessionsCount: integer("sessions").notNull(),
    bounceRate: numeric("bounce_rate"),
    avgSessionDuration: numeric("avg_session_duration"),
    visitorsToday: integer("visitors_today").notNull(),
    pageViewsToday: integer("page_views_today").notNull(),
  },
  (table) => ({
    websiteDateKey: uniqueIndex("mv_website_daily_stats_website_id_date_key").on(table.websiteId, table.date),
  })
)

export const mvWebsitePageStats = pgTable(
  "mv_website_page_stats",
  {
    websiteId: text("website_id").notNull(),
    page: text("page").notNull(),
    views: integer("views").notNull(),
    uniqueVisitors: integer("unique_visitors").notNull(),
    sessionsCount: integer("sessions").notNull(),
    bounceRate: numeric("bounce_rate"),
    avgLoadTime: numeric("avg_load_time"),
    avgTti: numeric("avg_tti"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.websiteId, table.page] }),
  })
)

export const mvWebsiteDeviceStats = pgTable(
  "mv_website_device_stats",
  {
    websiteId: text("website_id").notNull(),
    device: text("device"),
    browser: text("browser"),
    os: text("os"),
    uniqueVisitors: integer("unique_visitors").notNull(),
    pageViews: integer("page_views").notNull(),
    sessionsCount: integer("sessions").notNull(),
    bounceRate: numeric("bounce_rate"),
    avgSessionDuration: numeric("avg_session_duration"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.websiteId] }),
  })
)

export const mvWebsiteTrafficSources = pgTable(
  "mv_website_traffic_sources",
  {
    websiteId: text("website_id").notNull(),
    source: text("source"),
    medium: text("medium"),
    utmCampaign: text("utm_campaign"),
    referrerDomain: text("referrer_domain"),
    uniqueVisitors: integer("unique_visitors").notNull(),
    pageViews: integer("page_views").notNull(),
    sessionsCount: integer("sessions").notNull(),
    bounceRate: numeric("bounce_rate"),
    avgSessionDuration: numeric("avg_session_duration"),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.websiteId] }),
  })
)

export const mvVisitorEngagement = pgTable(
  "mv_visitor_engagement",
  {
    websiteId: text("website_id").notNull(),
    visitorId: text("visitor_id").notNull(),
    totalSessions: integer("total_sessions").notNull(),
    totalPageViews: integer("total_page_views").notNull(),
    avgSessionDuration: numeric("avg_session_duration"),
    maxSessionDuration: numeric("max_session_duration"),
    minSessionDuration: numeric("min_session_duration"),
    uniquePagesVisited: integer("unique_pages_visited").notNull(),
    pagesPerSession: numeric("pages_per_session"),
    firstVisit: timestamp("first_visit", { mode: "string" }).notNull(),
    lastVisit: timestamp("last_visit", { mode: "string" }).notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.websiteId, table.visitorId] }),
  })
)

// ─── Organizations (multi-tenant mode) ───

export const organizations = pgTable(
  "organizations",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    plan: text("plan").default("free").notNull(),
    createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
  },
  (table) => ({
    slugKey: uniqueIndex("organizations_slug_key").on(table.slug),
  })
)

export const organizationMembers = pgTable(
  "organization_members",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").default("member").notNull(), // owner, admin, member
    createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  },
  (table) => ({
    orgUserKey: uniqueIndex("org_members_org_user_key").on(table.organizationId, table.userId),
  })
)

// ─── Websites ───

export const websites = pgTable(
  "websites",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    name: text("name").notNull(),
    url: text("url").notNull(),
    description: text("description"),
    trackingCode: text("tracking_code").notNull(),
    status: websiteStatusEnum("status").default("ACTIVE").notNull(),
    excludedPaths: jsonb("excluded_paths"),
    cookieConsent: jsonb("cookie_consent").$type<{
      enabled: boolean
      position: "bottom" | "top" | "bottom-left" | "bottom-right"
      theme: "light" | "dark" | "auto"
      message: string
      acceptText: string
      rejectText: string
      categories: { necessary: boolean; analytics: boolean; marketing: boolean; preferences: boolean }
      privacyPolicyUrl?: string
    }>(),
    cloudflareZoneId: text("cloudflare_zone_id"),
    cloudflareSyncedAt: timestamp("cloudflare_synced_at", { mode: "string" }),
    googleAnalyticsPropertyId: text("google_analytics_property_id"),
    googleAnalyticsSyncedAt: timestamp("google_analytics_synced_at", { mode: "string" }),
    searchConsoleSiteUrl: text("search_console_site_url"),
    searchConsoleSyncedAt: timestamp("search_console_synced_at", { mode: "string" }),
    stripeApiKey: text("stripe_api_key"),
    stripeSyncedAt: timestamp("stripe_synced_at", { mode: "string" }),
    posthogConfig: text("posthog_config"),
    posthogSyncedAt: timestamp("posthog_synced_at", { mode: "string" }),
    // Sitemap auto-indexing
    sitemapUrl: text("sitemap_url"),
    autoIndexEnabled: boolean("auto_index_enabled").default(false),
    indexNowEnabled: boolean("index_now_enabled").default(true),
    indexNowKey: text("index_now_key"),
    lastSitemapCheck: timestamp("last_sitemap_check", { mode: "string" }),
    lastSitemapHash: text("last_sitemap_hash"),
    // Speed Insights (Core Web Vitals RUM)
    speedInsightsEnabled: boolean("speed_insights_enabled").default(false),
    // Cookieless tracking — when on, the SDK skips cookies/localStorage and
    // visitor IDs are derived server-side from a daily-rotating hash. Avoids
    // the need for a consent banner under GDPR/CCPA. Nullable so adding the
    // column to existing populated tables doesn't need a backfill — readers
    // treat null as false.
    cookielessMode: boolean("cookieless_mode").default(false),
    // Uptime monitoring
    uptimeEnabled: boolean("uptime_enabled").default(false),
    uptimeKeyword: text("uptime_keyword"),
    uptimeInterval: integer("uptime_interval").default(5),
    uptimeBaselineResponseTime: integer("uptime_baseline_response_time"),
    uptimeContentHash: text("uptime_content_hash"),
    uptimeSslExpiry: timestamp("uptime_ssl_expiry", { mode: "string" }),
    lastUptimeCheck: timestamp("last_uptime_check", { mode: "string" }),
    lastUptimeStatus: text("last_uptime_status"),
    ownerId: text("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    organizationId: text("organization_id")
      .references(() => organizations.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
  },
  (table) => ({
    trackingCodeKey: uniqueIndex("websites_tracking_code_key").on(table.trackingCode),
  })
)

// Uptime monitoring
export const uptimeChecks = pgTable(
  "uptime_checks",
  {
    id: text("id").notNull().default(sql`gen_random_uuid()`),
    websiteId: text("website_id")
      .notNull()
      .references(() => websites.id, { onDelete: "cascade" }),
    status: text("status").notNull(), // 'up' | 'down' | 'degraded' | 'changed'
    statusCode: integer("status_code"),
    responseTime: integer("response_time"), // ms
    errorMessage: text("error_message"),
    contentHash: text("content_hash"),
    checkedAt: timestamp("checked_at", { mode: "string" }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id, table.checkedAt] }),
    websiteCheckedAtIdx: index("uptime_checks_website_checked_at_idx").on(table.websiteId, table.checkedAt),
  })
)

export const uptimeIncidents = pgTable(
  "uptime_incidents",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    websiteId: text("website_id")
      .notNull()
      .references(() => websites.id, { onDelete: "cascade" }),
    type: text("type").notNull(), // 'down' | 'degraded' | 'ssl' | 'content_changed'
    startedAt: timestamp("started_at", { mode: "string" }).defaultNow().notNull(),
    resolvedAt: timestamp("resolved_at", { mode: "string" }),
    durationSeconds: integer("duration_seconds"),
    estimatedLostVisitors: integer("estimated_lost_visitors"),
    notifiedAt: timestamp("notified_at", { mode: "string" }),
  },
  (table) => ({
    websiteIdx: index("uptime_incidents_website_idx").on(table.websiteId),
  })
)

export const userWebsiteAccess = pgTable(
  "user_website_access",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    websiteId: text("website_id")
      .notNull()
      .references(() => websites.id, { onDelete: "cascade" }),
    accessLevel: accessLevelEnum("access_level").default("READ").notNull(),
    createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  },
  (table) => ({
    userWebsiteKey: uniqueIndex("user_website_access_user_id_website_id_key").on(table.userId, table.websiteId),
  })
)


export const visitors = pgTable(
  "visitors",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    websiteId: text("website_id")
      .notNull()
      .references(() => websites.id, { onDelete: "cascade" }),
    visitorId: text("visitor_id").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    country: text("country"),
    state: text("state"),
    city: text("city"),
    lat: numeric("lat"),
    lon: numeric("lon"),
    browser: text("browser"),
    os: text("os"),
    device: text("device"),
    screenResolution: text("screen_resolution"),
    viewport: text("viewport"),
    language: text("language"),
    timezone: text("timezone"),
    connection: text("connection"),
    pixelRatio: numeric("pixel_ratio"),
    cookieEnabled: boolean("cookie_enabled"),
    doNotTrack: boolean("do_not_track"),
    firstVisit: timestamp("first_visit", { mode: "string" }).defaultNow().notNull(),
    lastVisit: timestamp("last_visit", { mode: "string" }).defaultNow().notNull(),
    totalSessions: integer("total_sessions").default(1).notNull(),
    totalPageViews: integer("total_page_views").default(0).notNull(),
    createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
  },
  (table) => ({
    websiteVisitorKey: uniqueIndex("visitors_website_id_visitor_id_key").on(table.websiteId, table.visitorId),
    idxWebsiteCreatedAt: index("visitors_website_id_created_at_idx").on(table.websiteId, table.createdAt),
    idxWebsiteDevice: index("visitors_website_id_device_idx").on(table.websiteId, table.device),
    idxWebsiteBrowser: index("visitors_website_id_browser_idx").on(table.websiteId, table.browser),
    idxWebsiteOs: index("visitors_website_id_os_idx").on(table.websiteId, table.os),
    idxWebsiteCountry: index("visitors_website_id_country_idx").on(table.websiteId, table.country),
  })
)

export const visitorSessions = pgTable(
  "visitor_sessions",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    websiteId: text("website_id")
      .notNull()
      .references(() => websites.id, { onDelete: "cascade" }),
    visitorId: text("visitor_id").notNull(),
    sessionId: text("session_id").notNull(),
    startTime: timestamp("start_time", { mode: "string" }).defaultNow().notNull(),
    endTime: timestamp("end_time", { mode: "string" }),
    duration: integer("duration"),
    pageViewCount: integer("page_view_count").default(0).notNull(),
    referrer: text("referrer"),
    utmSource: text("utm_source"),
    utmMedium: text("utm_medium"),
    utmCampaign: text("utm_campaign"),
    utmTerm: text("utm_term"),
    utmContent: text("utm_content"),
    source: text("source"),
    medium: text("medium"),
    referrerDomain: text("referrer_domain"),
    isSearchEngine: boolean("is_search_engine"),
    searchEngine: text("search_engine"),
    socialNetwork: text("social_network"),
    landingPage: text("landing_page"),
    exitPage: text("exit_page"),
    isBounce: boolean("is_bounce").default(false).notNull(),
    createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
  },
  (table) => ({
    websiteSessionKey: uniqueIndex("visitor_sessions_website_id_session_id_key").on(table.websiteId, table.sessionId),
    idxWebsiteCreatedAt: index("visitor_sessions_website_id_created_at_idx").on(table.websiteId, table.createdAt),
    idxVisitorId: index("visitor_sessions_visitor_id_idx").on(table.visitorId),
    idxWebsiteSource: index("visitor_sessions_website_id_source_idx").on(table.websiteId, table.source),
  })
)

export const pageViews = pgTable("page_views", {
  id: text("id").notNull().default(sql`gen_random_uuid()`),
  websiteId: text("website_id")
    .notNull()
    .references(() => websites.id, { onDelete: "cascade" }),
  visitorId: text("visitor_id").notNull(),
  sessionId: text("session_id").notNull(),
  page: text("page").notNull(),
  title: text("title"),
  referrer: text("referrer"),
  timeOnPage: integer("time_on_page"),
  timestamp: timestamp("timestamp", { mode: "string" }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.id, table.timestamp] }),
  idxWebsiteTimestamp: index("page_views_website_id_timestamp_idx").on(table.websiteId, table.timestamp),
  idxWebsiteVisitorId: index("page_views_website_id_visitor_id_idx").on(table.websiteId, table.visitorId),
  idxWebsiteSessionId: index("page_views_website_id_session_id_idx").on(table.websiteId, table.sessionId),
}))

export const events = pgTable("events", {
  id: text("id").notNull().default(sql`gen_random_uuid()`),
  websiteId: text("website_id")
    .notNull()
    .references(() => websites.id, { onDelete: "cascade" }),
  visitorId: text("visitor_id").notNull(),
  sessionId: text("session_id").notNull(),
  eventType: text("event_type").notNull(),
  eventName: text("event_name").notNull(),
  page: text("page").notNull(),
  properties: jsonb("properties"),
  timestamp: timestamp("timestamp", { mode: "string" }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
}, (table) => ({
  pk: primaryKey({ columns: [table.id, table.timestamp] }),
  idxWebsiteTimestamp: index("events_website_id_timestamp_idx").on(table.websiteId, table.timestamp),
  idxWebsiteEventName: index("events_website_id_event_name_idx").on(table.websiteId, table.eventName),
  idxWebsiteVisitorId: index("events_website_id_visitor_id_idx").on(table.websiteId, table.visitorId),
}))

export const performanceMetrics = pgTable("performance_metrics", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  websiteId: text("website_id")
    .notNull()
    .references(() => websites.id, { onDelete: "cascade" }),
  sessionId: text("session_id").notNull(),
  page: text("page").notNull(),
  loadTime: integer("load_time").notNull(),
  domContentLoaded: integer("dom_content_loaded").notNull(),
  timeToInteractive: integer("time_to_interactive").notNull(),
  firstPaint: integer("first_paint"),
  firstContentfulPaint: integer("first_contentful_paint"),
  navigationType: integer("navigation_type").notNull(),
  timestamp: timestamp("timestamp", { mode: "string" }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
}, (table) => ({
  idxWebsiteTimestamp: index("performance_metrics_website_id_timestamp_idx").on(table.websiteId, table.timestamp),
  idxWebsiteSessionId: index("performance_metrics_website_id_session_id_idx").on(table.websiteId, table.sessionId),
}))

export const goals = pgTable("goals", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  websiteId: text("website_id")
    .notNull()
    .references(() => websites.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  type: goalTypeEnum("type").notNull(),
  targetValue: text("target_value").notNull(),
  targetQuery: text("target_query"),
  threshold: integer("threshold").default(1).notNull(),
  targetUnit: text("target_unit").default("TOTAL").notNull(),
  isActive: boolean("is_active").default(true).notNull(),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
})

export const conversions = pgTable("conversions", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  goalId: text("goal_id")
    .notNull()
    .references(() => goals.id, { onDelete: "cascade" }),
  websiteId: text("website_id")
    .notNull()
    .references(() => websites.id, { onDelete: "cascade" }),
  visitorId: text("visitor_id").notNull(),
  sessionId: text("session_id").notNull(),
  value: decimal("value", { precision: 10, scale: 2 }),
  metadata: jsonb("metadata"),
  timestamp: timestamp("timestamp", { mode: "string" }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
}, (table) => ({
  idxWebsiteTimestamp: index("conversions_website_id_timestamp_idx").on(table.websiteId, table.timestamp),
  idxGoalId: index("conversions_goal_id_idx").on(table.goalId),
  idxWebsiteGoalTimestamp: index("conversions_website_id_goal_id_timestamp_idx").on(table.websiteId, table.goalId, table.timestamp),
}))

// ─── Funnels ───

export const funnels = pgTable("funnels", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  websiteId: text("website_id").notNull().references(() => websites.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
})

export const funnelSteps = pgTable("funnel_steps", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  funnelId: text("funnel_id").notNull().references(() => funnels.id, { onDelete: "cascade" }),
  stepOrder: integer("step_order").notNull(),
  name: text("name").notNull(),
  type: text("type").notNull(), // "pageview" | "event"
  targetValue: text("target_value").notNull(), // page path or event name
  targetMatch: text("target_match").default("exact").notNull(), // "exact" | "contains" | "regex"
}, (table) => ({
  funnelOrderKey: uniqueIndex("funnel_steps_funnel_order_key").on(table.funnelId, table.stepOrder),
}))

export const customReports = pgTable("custom_reports", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  websiteId: text("website_id")
    .notNull()
    .references(() => websites.id, { onDelete: "cascade" }),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  description: text("description"),
  metrics: jsonb("metrics").notNull(),
  filters: jsonb("filters"),
  schedule: text("schedule"),
  isActive: boolean("is_active").default(true).notNull(),
  isPublic: boolean("is_public").default(false).notNull(),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { mode: "string" }).defaultNow().notNull(),
})

// Search Console data (query-level daily metrics)
export const searchConsoleData = pgTable(
  "search_console_data",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    websiteId: text("website_id")
      .notNull()
      .references(() => websites.id, { onDelete: "cascade" }),
    recordDate: date("record_date").notNull(),
    query: text("query").notNull(),
    page: text("page").notNull(),
    clicks: integer("clicks").default(0).notNull(),
    impressions: integer("impressions").default(0).notNull(),
    ctr: decimal("ctr", { precision: 7, scale: 4 }).default("0").notNull(),
    position: decimal("position", { precision: 7, scale: 2 }).default("0").notNull(),
    createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  },
  (table) => ({
    websiteDateQueryPageKey: uniqueIndex("sc_data_ws_date_query_page_key")
      .on(table.websiteId, table.recordDate, table.query, table.page),
    idxWebsiteRecordDate: index("sc_data_website_id_record_date_idx")
      .on(table.websiteId, table.recordDate),
    idxWebsiteQuery: index("sc_data_website_id_query_idx")
      .on(table.websiteId, table.query),
  })
)

// Stripe revenue data (daily aggregates)
export const stripeData = pgTable(
  "stripe_data",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    websiteId: text("website_id")
      .notNull()
      .references(() => websites.id, { onDelete: "cascade" }),
    recordDate: date("record_date").notNull(),
    revenue: integer("revenue").default(0).notNull(),        // in cents
    refunds: integer("refunds").default(0).notNull(),        // in cents
    charges: integer("charges").default(0).notNull(),        // successful charge count
    refundCount: integer("refund_count").default(0).notNull(),
    newCustomers: integer("new_customers").default(0).notNull(),
    currency: text("currency").default("usd").notNull(),
    createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  },
  (table) => ({
    websiteDateKey: uniqueIndex("stripe_data_ws_date_key")
      .on(table.websiteId, table.recordDate),
    idxWebsiteRecordDate: index("stripe_data_website_id_record_date_idx")
      .on(table.websiteId, table.recordDate),
  })
)

// ─── API Keys ───

export const apiKeys = pgTable("api_keys", {
  id: text("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: "cascade" }),
  websiteId: text("website_id").references(() => websites.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  hashedKey: text("hashed_key").notNull(),
  keyPrefix: text("key_prefix").notNull(), // "ak_live_xxxx" first 12 chars for display
  scopes: text("scopes").default("read").notNull(),
  lastUsedAt: timestamp("last_used_at", { mode: "string" }),
  expiresAt: timestamp("expires_at", { mode: "string" }),
  createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
}, (table) => ({
  hashedKeyKey: uniqueIndex("api_keys_hashed_key_key").on(table.hashedKey),
  userIdIdx: index("api_keys_user_id_idx").on(table.userId),
}))

// Sitemap URLs tracked for auto-indexing
export const sitemapUrls = pgTable(
  "sitemap_urls",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    websiteId: text("website_id")
      .notNull()
      .references(() => websites.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    firstSeenAt: timestamp("first_seen_at", { mode: "string" }).defaultNow().notNull(),
    indexNowSubmittedAt: timestamp("index_now_submitted_at", { mode: "string" }),
    googleSubmittedAt: timestamp("google_submitted_at", { mode: "string" }),
    googleIndexedAt: timestamp("google_indexed_at", { mode: "string" }),
    googleStatus: text("google_status"), // 'pending' | 'submitted' | 'indexed' | 'not_indexed' | 'error'
    lastCheckedAt: timestamp("last_checked_at", { mode: "string" }),
    createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
  },
  (table) => ({
    websiteUrlKey: uniqueIndex("sitemap_urls_website_url_key").on(table.websiteId, table.url),
    websiteIdIdx: index("sitemap_urls_website_id_idx").on(table.websiteId),
    googleStatusIdx: index("sitemap_urls_google_status_idx").on(table.googleStatus),
  })
)

// Public share links — read-only access to a website's dashboard via token,
// no auth required. One token can be revoked / regenerated independently.
export const websiteShareLinks = pgTable(
  "website_share_links",
  {
    id: text("id").primaryKey().default(sql`gen_random_uuid()`),
    websiteId: text("website_id")
      .notNull()
      .references(() => websites.id, { onDelete: "cascade" }),
    token: text("token").notNull(),
    label: text("label"),
    createdBy: text("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { mode: "string" }),
    createdAt: timestamp("created_at", { mode: "string" }).defaultNow().notNull(),
    lastViewedAt: timestamp("last_viewed_at", { mode: "string" }),
    viewCount: integer("view_count").default(0).notNull(),
  },
  (table) => ({
    tokenIdx: uniqueIndex("website_share_links_token_idx").on(table.token),
    websiteIdx: index("website_share_links_website_idx").on(table.websiteId),
  })
)

// Web Vitals (Real User Monitoring — Core Web Vitals)
export const webVitals = pgTable(
  "web_vitals",
  {
    id: text("id").notNull().default(sql`gen_random_uuid()`),
    websiteId: text("website_id")
      .notNull()
      .references(() => websites.id, { onDelete: "cascade" }),
    name: text("name").notNull(),            // LCP | FCP | INP | CLS | TTFB
    value: integer("value").notNull(),       // ms (CLS stored as value * 1000)
    rating: text("rating").notNull(),        // good | needs-improvement | poor
    path: text("path").notNull(),
    deviceType: text("device_type"),         // mobile | tablet | desktop
    connectionType: text("connection_type"), // 4g | 3g | 2g | slow-2g | unknown
    recordedAt: timestamp("recorded_at", { mode: "string" }).defaultNow().notNull(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.id, table.recordedAt] }),
    websiteRecordedIdx: index("web_vitals_website_recorded_idx").on(table.websiteId, table.recordedAt),
    websiteNameIdx: index("web_vitals_website_name_idx").on(table.websiteId, table.name, table.recordedAt),
  })
)

export type User = typeof users.$inferSelect
export type InsertUser = typeof users.$inferInsert

