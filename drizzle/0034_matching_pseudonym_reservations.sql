CREATE TABLE IF NOT EXISTS "matching_pseudonym_reservations" (
  "session_id" text NOT NULL,
  "user_id" text NOT NULL,
  "pseudonym" text NOT NULL,
  "reserved_at" timestamp DEFAULT now() NOT NULL,
  "expires_at" timestamp NOT NULL,
  CONSTRAINT "matching_pseudonym_reservations_session_id_user_id_pk" PRIMARY KEY("session_id","user_id"),
  CONSTRAINT "matching_pseudonym_reservations_session_id_matching_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."matching_sessions"("id") ON DELETE cascade ON UPDATE no action,
  CONSTRAINT "matching_pseudonym_reservations_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "matching_pseudonym_reservations_session_pseudo_idx"
  ON "matching_pseudonym_reservations" USING btree ("session_id","pseudonym");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matching_pseudonym_reservations_expires_at_idx"
  ON "matching_pseudonym_reservations" USING btree ("expires_at");
