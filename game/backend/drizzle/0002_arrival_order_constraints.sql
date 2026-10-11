CREATE INDEX "session_event_history_idx" ON "session_events" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "session_player_arrival_idx" ON "session_players" USING btree ("session_id","arrival_order");--> statement-breakpoint
ALTER TABLE "session_players" ADD CONSTRAINT "session_player_arrival_positive" CHECK ("session_players"."arrival_order" > 0);