ALTER TABLE "session_players" ADD COLUMN "roster_id" text;--> statement-breakpoint
ALTER TABLE "session_players" ADD COLUMN "display_name" text;--> statement-breakpoint
ALTER TABLE "session_players" ADD COLUMN "first_name" text;--> statement-breakpoint
CREATE UNIQUE INDEX "session_event_admin_command_idx" ON "session_events" USING btree ("session_id",("data"->>'requestId')) WHERE "session_events"."type" = 'admin.command';