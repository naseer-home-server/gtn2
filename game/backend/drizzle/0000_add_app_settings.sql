CREATE TABLE "app_settings" (
	"id" text PRIMARY KEY NOT NULL,
	"email_login_enabled" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
