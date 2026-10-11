ALTER TABLE "session_events" ADD COLUMN "sequence" bigserial NOT NULL;--> statement-breakpoint
CREATE INDEX "session_event_sequence_idx" ON "session_events" USING btree ("session_id","sequence");--> statement-breakpoint
CREATE UNIQUE INDEX "session_event_request_idx" ON "session_events" USING btree ("session_id",("data"->>'requestId')) WHERE "session_events"."type" = 'player.command';