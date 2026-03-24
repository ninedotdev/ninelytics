ALTER TABLE "users" ADD COLUMN "bio" text;--> statement-breakpoint
CREATE INDEX "conversions_website_id_timestamp_idx" ON "conversions" USING btree ("website_id","timestamp");--> statement-breakpoint
CREATE INDEX "conversions_goal_id_idx" ON "conversions" USING btree ("goal_id");--> statement-breakpoint
CREATE INDEX "conversions_website_id_goal_id_timestamp_idx" ON "conversions" USING btree ("website_id","goal_id","timestamp");--> statement-breakpoint
CREATE INDEX "page_views_website_id_session_id_idx" ON "page_views" USING btree ("website_id","session_id");--> statement-breakpoint
CREATE INDEX "visitor_sessions_visitor_id_idx" ON "visitor_sessions" USING btree ("visitor_id");--> statement-breakpoint
CREATE INDEX "visitor_sessions_website_id_source_idx" ON "visitor_sessions" USING btree ("website_id","source");