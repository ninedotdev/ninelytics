ALTER TABLE "conversions" DROP CONSTRAINT "conversions_visitor_id_visitors_visitor_id_fk";
--> statement-breakpoint
ALTER TABLE "conversions" DROP CONSTRAINT "conversions_session_id_visitor_sessions_session_id_fk";
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_visitor_id_visitors_visitor_id_fk";
--> statement-breakpoint
ALTER TABLE "events" DROP CONSTRAINT "events_session_id_visitor_sessions_session_id_fk";
--> statement-breakpoint
ALTER TABLE "page_views" DROP CONSTRAINT "page_views_visitor_id_visitors_visitor_id_fk";
--> statement-breakpoint
ALTER TABLE "page_views" DROP CONSTRAINT "page_views_session_id_visitor_sessions_session_id_fk";
--> statement-breakpoint
ALTER TABLE "performance_metrics" DROP CONSTRAINT "performance_metrics_session_id_visitor_sessions_session_id_fk";
--> statement-breakpoint
ALTER TABLE "visitor_sessions" DROP CONSTRAINT "visitor_sessions_visitor_id_visitors_visitor_id_fk";
--> statement-breakpoint
CREATE INDEX "analytics_data_website_id_record_date_idx" ON "analytics_data" USING btree ("website_id","record_date");--> statement-breakpoint
CREATE INDEX "page_views_website_id_timestamp_idx" ON "page_views" USING btree ("website_id","timestamp");--> statement-breakpoint
CREATE INDEX "visitor_sessions_website_id_created_at_idx" ON "visitor_sessions" USING btree ("website_id","created_at");--> statement-breakpoint
CREATE INDEX "visitors_website_id_created_at_idx" ON "visitors" USING btree ("website_id","created_at");