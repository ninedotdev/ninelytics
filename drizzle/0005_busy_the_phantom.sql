ALTER TABLE "users" ADD COLUMN "cloudflare_api_token" text;--> statement-breakpoint
ALTER TABLE "websites" DROP COLUMN "cloudflare_api_token";