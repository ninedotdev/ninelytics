ALTER TYPE "public"."GoalType" ADD VALUE 'REVENUE';--> statement-breakpoint
ALTER TYPE "public"."GoalType" ADD VALUE 'SEARCH_POSITION';--> statement-breakpoint
ALTER TYPE "public"."GoalType" ADD VALUE 'SEARCH_CLICKS';--> statement-breakpoint
CREATE TABLE "search_console_data" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"website_id" text NOT NULL,
	"record_date" date NOT NULL,
	"query" text NOT NULL,
	"page" text NOT NULL,
	"clicks" integer DEFAULT 0 NOT NULL,
	"impressions" integer DEFAULT 0 NOT NULL,
	"ctr" numeric(7, 4) DEFAULT '0' NOT NULL,
	"position" numeric(7, 2) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stripe_data" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"website_id" text NOT NULL,
	"record_date" date NOT NULL,
	"revenue" integer DEFAULT 0 NOT NULL,
	"refunds" integer DEFAULT 0 NOT NULL,
	"charges" integer DEFAULT 0 NOT NULL,
	"refund_count" integer DEFAULT 0 NOT NULL,
	"new_customers" integer DEFAULT 0 NOT NULL,
	"currency" text DEFAULT 'usd' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "google_analytics_credentials" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "google_access_token" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "google_refresh_token" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "google_token_expires_at" timestamp;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "google_scopes" text;--> statement-breakpoint
ALTER TABLE "websites" ADD COLUMN "cookie_consent" jsonb;--> statement-breakpoint
ALTER TABLE "websites" ADD COLUMN "google_analytics_property_id" text;--> statement-breakpoint
ALTER TABLE "websites" ADD COLUMN "google_analytics_synced_at" timestamp;--> statement-breakpoint
ALTER TABLE "websites" ADD COLUMN "search_console_site_url" text;--> statement-breakpoint
ALTER TABLE "websites" ADD COLUMN "search_console_synced_at" timestamp;--> statement-breakpoint
ALTER TABLE "websites" ADD COLUMN "stripe_api_key" text;--> statement-breakpoint
ALTER TABLE "websites" ADD COLUMN "stripe_synced_at" timestamp;--> statement-breakpoint
ALTER TABLE "search_console_data" ADD CONSTRAINT "search_console_data_website_id_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stripe_data" ADD CONSTRAINT "stripe_data_website_id_websites_id_fk" FOREIGN KEY ("website_id") REFERENCES "public"."websites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "sc_data_ws_date_query_page_key" ON "search_console_data" USING btree ("website_id","record_date","query","page");--> statement-breakpoint
CREATE INDEX "sc_data_website_id_record_date_idx" ON "search_console_data" USING btree ("website_id","record_date");--> statement-breakpoint
CREATE INDEX "sc_data_website_id_query_idx" ON "search_console_data" USING btree ("website_id","query");--> statement-breakpoint
CREATE UNIQUE INDEX "stripe_data_ws_date_key" ON "stripe_data" USING btree ("website_id","record_date");--> statement-breakpoint
CREATE INDEX "stripe_data_website_id_record_date_idx" ON "stripe_data" USING btree ("website_id","record_date");