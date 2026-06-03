CREATE TABLE IF NOT EXISTS "matching_preference_events" (
  "id" text PRIMARY KEY NOT NULL,
  "session_id" text NOT NULL,
  "user_id" text NOT NULL,
  "actor_user_id" text NOT NULL,
  "event_type" text NOT NULL,
  "source" text NOT NULL,
  "book_id" text,
  "before" jsonb,
  "after" jsonb,
  "metadata" jsonb,
  "occurred_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "matching_preference_events"
  ADD CONSTRAINT "matching_preference_events_session_id_matching_sessions_id_fk"
  FOREIGN KEY ("session_id") REFERENCES "public"."matching_sessions"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "matching_preference_events"
  ADD CONSTRAINT "matching_preference_events_user_id_user_id_fk"
  FOREIGN KEY ("user_id") REFERENCES "public"."user"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "matching_preference_events"
  ADD CONSTRAINT "matching_preference_events_actor_user_id_user_id_fk"
  FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id")
  ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "matching_preference_events"
  ADD CONSTRAINT "matching_preference_events_book_id_books_id_fk"
  FOREIGN KEY ("book_id") REFERENCES "public"."books"("id")
  ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matching_preference_events_session_occurred_at_idx"
  ON "matching_preference_events" USING btree ("session_id", "occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matching_preference_events_user_occurred_at_idx"
  ON "matching_preference_events" USING btree ("user_id", "occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matching_preference_events_actor_occurred_at_idx"
  ON "matching_preference_events" USING btree ("actor_user_id", "occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matching_preference_events_type_occurred_at_idx"
  ON "matching_preference_events" USING btree ("event_type", "occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matching_preference_events_book_id_idx"
  ON "matching_preference_events" USING btree ("book_id");
