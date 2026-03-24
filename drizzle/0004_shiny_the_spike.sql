ALTER TABLE "websites" ADD COLUMN "cloudflare_zone_id" text;--> statement-breakpoint
ALTER TABLE "websites" ADD COLUMN "cloudflare_api_token" text;--> statement-breakpoint
ALTER TABLE "websites" ADD COLUMN "cloudflare_synced_at" timestamp;