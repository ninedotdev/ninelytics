CREATE INDEX "events_website_id_timestamp_idx" ON "events" USING btree ("website_id","timestamp");--> statement-breakpoint
CREATE INDEX "events_website_id_event_name_idx" ON "events" USING btree ("website_id","event_name");--> statement-breakpoint
CREATE INDEX "events_website_id_visitor_id_idx" ON "events" USING btree ("website_id","visitor_id");--> statement-breakpoint
CREATE INDEX "page_views_website_id_visitor_id_idx" ON "page_views" USING btree ("website_id","visitor_id");--> statement-breakpoint
CREATE INDEX "performance_metrics_website_id_timestamp_idx" ON "performance_metrics" USING btree ("website_id","timestamp");--> statement-breakpoint
CREATE INDEX "performance_metrics_website_id_session_id_idx" ON "performance_metrics" USING btree ("website_id","session_id");--> statement-breakpoint
CREATE INDEX "visitors_website_id_device_idx" ON "visitors" USING btree ("website_id","device");--> statement-breakpoint
CREATE INDEX "visitors_website_id_browser_idx" ON "visitors" USING btree ("website_id","browser");--> statement-breakpoint
CREATE INDEX "visitors_website_id_os_idx" ON "visitors" USING btree ("website_id","os");--> statement-breakpoint
CREATE INDEX "visitors_website_id_country_idx" ON "visitors" USING btree ("website_id","country");