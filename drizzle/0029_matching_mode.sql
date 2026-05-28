CREATE TABLE "matching_sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"deadline_at" timestamp,
	"status" text DEFAULT 'active' NOT NULL,
	"target_group_size" integer DEFAULT 3 NOT NULL,
	"frozen_at" timestamp,
	"frozen_scenario_json" jsonb
);
--> statement-breakpoint
CREATE TABLE "matching_session_participants" (
	"session_id" text NOT NULL,
	"user_id" text NOT NULL,
	"pseudonym" text NOT NULL,
	"joined_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "matching_session_participants_pkey" PRIMARY KEY("session_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "admin_views" (
	"id" text PRIMARY KEY NOT NULL,
	"admin_id" text NOT NULL,
	"viewed_user_id" text NOT NULL,
	"session_id" text,
	"ts" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "matching_sessions" ADD CONSTRAINT "matching_sessions_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "matching_session_participants" ADD CONSTRAINT "matching_session_participants_session_id_matching_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."matching_sessions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "matching_session_participants" ADD CONSTRAINT "matching_session_participants_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "admin_views" ADD CONSTRAINT "admin_views_admin_id_user_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "admin_views" ADD CONSTRAINT "admin_views_viewed_user_id_user_id_fk" FOREIGN KEY ("viewed_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "admin_views" ADD CONSTRAINT "admin_views_session_id_matching_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."matching_sessions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "matching_sessions_single_active_idx" ON "matching_sessions" USING btree ("status") WHERE "matching_sessions"."status" = 'active';
--> statement-breakpoint
CREATE UNIQUE INDEX "matching_session_participants_session_pseudo_idx" ON "matching_session_participants" USING btree ("session_id","pseudonym");
--> statement-breakpoint
CREATE INDEX "admin_views_admin_id_idx" ON "admin_views" USING btree ("admin_id");
--> statement-breakpoint
CREATE INDEX "admin_views_ts_idx" ON "admin_views" USING btree ("ts");
