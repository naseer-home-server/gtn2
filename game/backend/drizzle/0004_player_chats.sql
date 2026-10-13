CREATE TABLE "chat_conversation_members" (
	"conversation_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "chat_conversations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"name" text,
	"direct_key" text,
	"created_by_player_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_conversation_kind_valid" CHECK ("chat_conversations"."kind" in ('direct', 'group')),
	CONSTRAINT "chat_conversation_name_valid" CHECK (("chat_conversations"."kind" = 'direct' and "chat_conversations"."name" is null) or ("chat_conversations"."kind" = 'group' and "chat_conversations"."name" is not null and length("chat_conversations"."name") between 1 and 60)),
	CONSTRAINT "chat_conversation_direct_key_valid" CHECK (("chat_conversations"."kind" = 'direct' and "chat_conversations"."direct_key" is not null) or ("chat_conversations"."kind" = 'group' and "chat_conversations"."direct_key" is null))
);
--> statement-breakpoint
CREATE TABLE "chat_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"conversation_id" uuid NOT NULL,
	"sender_player_id" uuid NOT NULL,
	"sequence" bigserial NOT NULL,
	"client_message_id" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "chat_message_text_valid" CHECK (length("chat_messages"."text") between 1 and 2000),
	CONSTRAINT "chat_message_client_id_valid" CHECK (length("chat_messages"."client_message_id") between 1 and 128)
);
--> statement-breakpoint
ALTER TABLE "chat_conversation_members" ADD CONSTRAINT "chat_conversation_members_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversation_members" ADD CONSTRAINT "chat_conversation_members_player_id_session_players_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."session_players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_session_id_game_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."game_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_conversations" ADD CONSTRAINT "chat_conversations_created_by_player_id_session_players_id_fk" FOREIGN KEY ("created_by_player_id") REFERENCES "public"."session_players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_conversation_id_chat_conversations_id_fk" FOREIGN KEY ("conversation_id") REFERENCES "public"."chat_conversations"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "chat_messages" ADD CONSTRAINT "chat_messages_sender_player_id_session_players_id_fk" FOREIGN KEY ("sender_player_id") REFERENCES "public"."session_players"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "chat_conversation_member_idx" ON "chat_conversation_members" USING btree ("conversation_id","player_id");--> statement-breakpoint
CREATE INDEX "chat_member_player_idx" ON "chat_conversation_members" USING btree ("player_id","conversation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_conversation_direct_idx" ON "chat_conversations" USING btree ("session_id","direct_key");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_conversation_id_session_idx" ON "chat_conversations" USING btree ("id","session_id");--> statement-breakpoint
CREATE INDEX "chat_conversation_session_created_idx" ON "chat_conversations" USING btree ("session_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "chat_message_idempotency_idx" ON "chat_messages" USING btree ("conversation_id","sender_player_id","client_message_id");--> statement-breakpoint
CREATE INDEX "chat_message_history_idx" ON "chat_messages" USING btree ("conversation_id","sequence");