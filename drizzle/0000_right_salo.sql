CREATE TYPE "public"."AccessLevel" AS ENUM('READ', 'WRITE', 'ADMIN');--> statement-breakpoint
CREATE TYPE "public"."GoalType" AS ENUM('PAGEVIEW', 'EVENT', 'DURATION');--> statement-breakpoint
CREATE TYPE "public"."UserRole" AS ENUM('ADMIN', 'OWNER', 'VIEWER');--> statement-breakpoint
CREATE TYPE "public"."WebsiteStatus" AS ENUM('ACTIVE', 'INACTIVE', 'PENDING');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "analytics_data" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"website_id" text NOT NULL,
	"page_views" integer DEFAULT 0 NOT NULL,
	"unique_visitors" integer DEFAULT 0 NOT NULL,
	"bounce_rate" numeric(5, 2) DEFAULT '0.00' NOT NULL,
	"avg_session_duration" integer DEFAULT 0 NOT NULL,
	"record_date" date NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "conversions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"goal_id" text NOT NULL,
	"website_id" text NOT NULL,
	"visitor_id" text NOT NULL,
	"session_id" text NOT NULL,
	"value" numeric(10, 2),
	"metadata" jsonb,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "custom_reports" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"website_id" text NOT NULL,
	"user_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"metrics" jsonb NOT NULL,
	"filters" jsonb,
	"schedule" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"is_public" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"website_id" text NOT NULL,
	"visitor_id" text NOT NULL,
	"session_id" text NOT NULL,
	"event_type" text NOT NULL,
	"event_name" text NOT NULL,
	"page" text NOT NULL,
	"properties" jsonb,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "goals" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"website_id" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"type" "GoalType" NOT NULL,
	"target_value" text NOT NULL,
	"threshold" integer DEFAULT 1 NOT NULL,
	"target_unit" text DEFAULT 'TOTAL' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mv_visitor_engagement" (
	"website_id" text NOT NULL,
	"visitor_id" text NOT NULL,
	"total_sessions" integer NOT NULL,
	"total_page_views" integer NOT NULL,
	"avg_session_duration" numeric,
	"max_session_duration" numeric,
	"min_session_duration" numeric,
	"unique_pages_visited" integer NOT NULL,
	"pages_per_session" numeric,
	"first_visit" timestamp NOT NULL,
	"last_visit" timestamp NOT NULL,
	CONSTRAINT "mv_visitor_engagement_website_id_visitor_id_pk" PRIMARY KEY("website_id","visitor_id")
);
--> statement-breakpoint
CREATE TABLE "mv_website_daily_stats" (
	"website_id" text NOT NULL,
	"date" date NOT NULL,
	"unique_visitors" integer NOT NULL,
	"page_views" integer NOT NULL,
	"sessions" integer NOT NULL,
	"bounce_rate" numeric,
	"avg_session_duration" numeric,
	"visitors_today" integer NOT NULL,
	"page_views_today" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "mv_website_device_stats" (
	"website_id" text NOT NULL,
	"device" text,
	"browser" text,
	"os" text,
	"unique_visitors" integer NOT NULL,
	"page_views" integer NOT NULL,
	"sessions" integer NOT NULL,
	"bounce_rate" numeric,
	"avg_session_duration" numeric,
	CONSTRAINT "mv_website_device_stats_website_id_pk" PRIMARY KEY("website_id")
);
--> statement-breakpoint
CREATE TABLE "mv_website_page_stats" (
	"website_id" text NOT NULL,
	"page" text NOT NULL,
	"views" integer NOT NULL,
	"unique_visitors" integer NOT NULL,
	"sessions" integer NOT NULL,
	"bounce_rate" numeric,
	"avg_load_time" numeric,
	"avg_tti" numeric,
	CONSTRAINT "mv_website_page_stats_website_id_page_pk" PRIMARY KEY("website_id","page")
);
--> statement-breakpoint
CREATE TABLE "mv_website_traffic_sources" (
	"website_id" text NOT NULL,
	"source" text,
	"medium" text,
	"utm_campaign" text,
	"referrer_domain" text,
	"unique_visitors" integer NOT NULL,
	"page_views" integer NOT NULL,
	"sessions" integer NOT NULL,
	"bounce_rate" numeric,
	"avg_session_duration" numeric,
	CONSTRAINT "mv_website_traffic_sources_website_id_pk" PRIMARY KEY("website_id")
);
--> statement-breakpoint
CREATE TABLE "page_views" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"website_id" text NOT NULL,
	"visitor_id" text NOT NULL,
	"session_id" text NOT NULL,
	"page" text NOT NULL,
	"title" text,
	"referrer" text,
	"time_on_page" integer,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "performance_metrics" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"website_id" text NOT NULL,
	"session_id" text NOT NULL,
	"page" text NOT NULL,
	"load_time" integer NOT NULL,
	"dom_content_loaded" integer NOT NULL,
	"time_to_interactive" integer NOT NULL,
	"first_paint" integer,
	"first_contentful_paint" integer,
	"navigation_type" integer NOT NULL,
	"timestamp" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_token" text NOT NULL,
	"user_id" text NOT NULL,
	"expires" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_website_access" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"website_id" text NOT NULL,
	"access_level" "AccessLevel" DEFAULT 'READ' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"email" text NOT NULL,
	"email_verified" timestamp,
	"image" text,
	"password" text,
	"role" "UserRole" DEFAULT 'OWNER' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verification_tokens_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
CREATE TABLE "visitor_sessions" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"website_id" text NOT NULL,
	"visitor_id" text NOT NULL,
	"session_id" text NOT NULL,
	"start_time" timestamp DEFAULT now() NOT NULL,
	"end_time" timestamp,
	"duration" integer,
	"page_view_count" integer DEFAULT 0 NOT NULL,
	"referrer" text,
	"utm_source" text,
	"utm_medium" text,
	"utm_campaign" text,
	"utm_term" text,
	"utm_content" text,
	"source" text,
	"medium" text,
	"referrer_domain" text,
	"is_search_engine" boolean,
	"search_engine" text,
	"social_network" text,
	"landing_page" text,
	"exit_page" text,
	"is_bounce" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visitors" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"website_id" text NOT NULL,
	"visitor_id" text NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"country" text,
	"state" text,
	"city" text,
	"browser" text,
	"os" text,
	"device" text,
	"screen_resolution" text,
	"viewport" text,
	"language" text,
	"timezone" text,
	"connection" text,
	"pixel_ratio" numeric,
	"cookie_enabled" boolean,
	"do_not_track" boolean,
	"first_visit" timestamp DEFAULT now() NOT NULL,
	"last_visit" timestamp DEFAULT now() NOT NULL,
	"total_sessions" integer DEFAULT 1 NOT NULL,
	"total_page_views" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "websites" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"url" text NOT NULL,
	"description" text,
	"tracking_code" text NOT NULL,
	"status" "WebsiteStatus" DEFAULT 'ACTIVE' NOT NULL,
	"excluded_paths" jsonb,
	"owner_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_data" ADD CONSTRAINT "analytics_data_website_id_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversions" ADD CONSTRAINT "conversions_goal_id_goals_id_fk" FOREIGN KEY ("goal_id") REFERENCES "public"."goals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversions" ADD CONSTRAINT "conversions_website_id_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversions" ADD CONSTRAINT "conversions_visitor_id_visitors_visitor_id_fk" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitors"("visitor_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conversions" ADD CONSTRAINT "conversions_session_id_visitor_sessions_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."visitor_sessions"("session_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_reports" ADD CONSTRAINT "custom_reports_website_id_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "custom_reports" ADD CONSTRAINT "custom_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_website_id_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_visitor_id_visitors_visitor_id_fk" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitors"("visitor_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_session_id_visitor_sessions_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."visitor_sessions"("session_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "goals" ADD CONSTRAINT "goals_website_id_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_views" ADD CONSTRAINT "page_views_website_id_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_views" ADD CONSTRAINT "page_views_visitor_id_visitors_visitor_id_fk" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitors"("visitor_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "page_views" ADD CONSTRAINT "page_views_session_id_visitor_sessions_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."visitor_sessions"("session_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_metrics" ADD CONSTRAINT "performance_metrics_website_id_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_metrics" ADD CONSTRAINT "performance_metrics_session_id_visitor_sessions_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."visitor_sessions"("session_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_website_access" ADD CONSTRAINT "user_website_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_website_access" ADD CONSTRAINT "user_website_access_website_id_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_sessions" ADD CONSTRAINT "visitor_sessions_website_id_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitor_sessions" ADD CONSTRAINT "visitor_sessions_visitor_id_visitors_visitor_id_fk" FOREIGN KEY ("visitor_id") REFERENCES "public"."visitors"("visitor_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visitors" ADD CONSTRAINT "visitors_website_id_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "websites" ADD CONSTRAINT "websites_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_provider_provider_account_id_key" ON "accounts" USING btree ("provider","provider_account_id");--> statement-breakpoint
CREATE UNIQUE INDEX "analytics_data_website_id_record_date_key" ON "analytics_data" USING btree ("website_id","record_date");--> statement-breakpoint
CREATE UNIQUE INDEX "mv_website_daily_stats_website_id_date_key" ON "mv_website_daily_stats" USING btree ("website_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "sessions_session_token_key" ON "sessions" USING btree ("session_token");--> statement-breakpoint
CREATE UNIQUE INDEX "user_website_access_user_id_website_id_key" ON "user_website_access" USING btree ("user_id","website_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_key" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_tokens_token_key" ON "verification_tokens" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "visitor_sessions_session_id_key" ON "visitor_sessions" USING btree ("session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "visitor_sessions_website_id_session_id_key" ON "visitor_sessions" USING btree ("website_id","session_id");--> statement-breakpoint
CREATE UNIQUE INDEX "visitors_website_id_visitor_id_key" ON "visitors" USING btree ("website_id","visitor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "visitors_visitor_id_key" ON "visitors" USING btree ("visitor_id");--> statement-breakpoint
CREATE UNIQUE INDEX "websites_tracking_code_key" ON "websites" USING btree ("tracking_code");