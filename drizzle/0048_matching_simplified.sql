-- Existing matching data is disposable. Deleting the session cascades through all
-- legacy session-scoped tables while preserving users, books, signups, and ranks.
DELETE FROM "matching_sessions";
--> statement-breakpoint
ALTER TABLE "matching_session_participants" ADD COLUMN IF NOT EXISTS "public_ref" text;
--> statement-breakpoint
UPDATE "matching_session_participants" SET "public_ref" = gen_random_uuid()::text WHERE "public_ref" IS NULL;
--> statement-breakpoint
ALTER TABLE "matching_session_participants" ALTER COLUMN "public_ref" SET NOT NULL;
--> statement-breakpoint
ALTER TABLE "matching_session_participants" ADD COLUMN IF NOT EXISTS "join_source" text DEFAULT 'self' NOT NULL;
--> statement-breakpoint
ALTER TABLE "matching_session_participants" ALTER COLUMN "pseudonym" DROP NOT NULL;
--> statement-breakpoint
DROP INDEX IF EXISTS "matching_session_participants_session_pseudo_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "matching_session_participants_session_public_ref_idx"
  ON "matching_session_participants" ("session_id", "public_ref");
--> statement-breakpoint
ALTER TABLE "matching_session_participants"
  DROP CONSTRAINT IF EXISTS "matching_session_participants_join_source_check";
--> statement-breakpoint
ALTER TABLE "matching_session_participants"
  ADD CONSTRAINT "matching_session_participants_join_source_check"
  CHECK ("join_source" IN ('self', 'admin'));
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "matching_circle_confirmations" (
  "session_id" text NOT NULL,
  "user_id" text NOT NULL,
  "book_id" text NOT NULL,
  "circle_key" text NOT NULL,
  "member_user_ids_json" jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "matching_circle_confirmations_session_user_pk" PRIMARY KEY ("session_id", "user_id"),
  CONSTRAINT "matching_circle_confirmations_session_id_matching_sessions_id_fk"
    FOREIGN KEY ("session_id") REFERENCES "public"."matching_sessions"("id") ON DELETE cascade,
  CONSTRAINT "matching_circle_confirmations_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade,
  CONSTRAINT "matching_circle_confirmations_book_id_books_id_fk"
    FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matching_circle_confirmations_session_circle_idx"
  ON "matching_circle_confirmations" ("session_id", "circle_key");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "matching_locked_circles" (
  "id" text PRIMARY KEY NOT NULL,
  "session_id" text NOT NULL,
  "book_id" text NOT NULL,
  "circle_key" text NOT NULL,
  "status" text DEFAULT 'locked' NOT NULL,
  "locked_at" timestamp DEFAULT now() NOT NULL,
  "locked_state_version" integer NOT NULL,
  "dissolved_at" timestamp,
  "dissolved_by" text,
  "dissolve_reason" text,
  CONSTRAINT "matching_locked_circles_status_check" CHECK ("status" IN ('locked', 'dissolved')),
  CONSTRAINT "matching_locked_circles_session_id_matching_sessions_id_fk"
    FOREIGN KEY ("session_id") REFERENCES "public"."matching_sessions"("id") ON DELETE cascade,
  CONSTRAINT "matching_locked_circles_book_id_books_id_fk"
    FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE restrict,
  CONSTRAINT "matching_locked_circles_dissolved_by_user_id_fk"
    FOREIGN KEY ("dissolved_by") REFERENCES "public"."user"("id") ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "matching_locked_circles_active_circle_idx"
  ON "matching_locked_circles" ("session_id", "circle_key")
  WHERE "status" = 'locked';
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matching_locked_circles_session_locked_at_idx"
  ON "matching_locked_circles" ("session_id", "locked_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "matching_locked_circle_members" (
  "circle_id" text NOT NULL,
  "session_id" text NOT NULL,
  "user_id" text NOT NULL,
  "display_name_snapshot" text NOT NULL,
  "released_at" timestamp,
  CONSTRAINT "matching_locked_circle_members_circle_user_pk" PRIMARY KEY ("circle_id", "user_id"),
  CONSTRAINT "matching_locked_circle_members_circle_id_matching_locked_circles_id_fk"
    FOREIGN KEY ("circle_id") REFERENCES "public"."matching_locked_circles"("id") ON DELETE cascade,
  CONSTRAINT "matching_locked_circle_members_session_id_matching_sessions_id_fk"
    FOREIGN KEY ("session_id") REFERENCES "public"."matching_sessions"("id") ON DELETE cascade,
  CONSTRAINT "matching_locked_circle_members_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "matching_locked_circle_members_active_user_idx"
  ON "matching_locked_circle_members" ("session_id", "user_id")
  WHERE "released_at" IS NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "matching_notices" (
  "id" text PRIMARY KEY NOT NULL,
  "session_id" text NOT NULL,
  "user_id" text NOT NULL,
  "kind" text NOT NULL,
  "payload" jsonb NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "read_at" timestamp,
  CONSTRAINT "matching_notices_session_id_matching_sessions_id_fk"
    FOREIGN KEY ("session_id") REFERENCES "public"."matching_sessions"("id") ON DELETE cascade,
  CONSTRAINT "matching_notices_user_id_user_id_fk"
    FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matching_notices_session_user_unread_idx"
  ON "matching_notices" ("session_id", "user_id", "read_at");
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "matching_events" (
  "id" text PRIMARY KEY NOT NULL,
  "session_id" text NOT NULL,
  "event_type" text NOT NULL,
  "actor_user_id" text,
  "actor_name_snapshot" text,
  "subject_user_id" text,
  "subject_name_snapshot" text,
  "source" text NOT NULL,
  "book_id" text,
  "before" jsonb,
  "after" jsonb,
  "metadata" jsonb,
  "state_version" integer NOT NULL,
  "occurred_at" timestamp DEFAULT now() NOT NULL,
  CONSTRAINT "matching_events_session_id_matching_sessions_id_fk"
    FOREIGN KEY ("session_id") REFERENCES "public"."matching_sessions"("id") ON DELETE cascade,
  CONSTRAINT "matching_events_actor_user_id_user_id_fk"
    FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null,
  CONSTRAINT "matching_events_subject_user_id_user_id_fk"
    FOREIGN KEY ("subject_user_id") REFERENCES "public"."user"("id") ON DELETE set null,
  CONSTRAINT "matching_events_book_id_books_id_fk"
    FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matching_events_session_occurred_at_idx"
  ON "matching_events" ("session_id", "occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matching_events_subject_occurred_at_idx"
  ON "matching_events" ("subject_user_id", "occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "matching_events_type_occurred_at_idx"
  ON "matching_events" ("event_type", "occurred_at");
--> statement-breakpoint

DROP TRIGGER IF EXISTS "audit_matching_circle_confirmations" ON "matching_circle_confirmations";
--> statement-breakpoint
CREATE TRIGGER audit_matching_circle_confirmations
  AFTER INSERT OR UPDATE OR DELETE ON "matching_circle_confirmations" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "audit_matching_locked_circles" ON "matching_locked_circles";
--> statement-breakpoint
CREATE TRIGGER audit_matching_locked_circles
  AFTER INSERT OR UPDATE OR DELETE ON "matching_locked_circles" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "audit_matching_locked_circle_members" ON "matching_locked_circle_members";
--> statement-breakpoint
CREATE TRIGGER audit_matching_locked_circle_members
  AFTER INSERT OR UPDATE OR DELETE ON "matching_locked_circle_members" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "audit_matching_notices" ON "matching_notices";
--> statement-breakpoint
CREATE TRIGGER audit_matching_notices
  AFTER INSERT OR UPDATE OR DELETE ON "matching_notices" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
DROP TRIGGER IF EXISTS "audit_matching_events" ON "matching_events";
--> statement-breakpoint
CREATE TRIGGER audit_matching_events
  AFTER INSERT OR UPDATE OR DELETE ON "matching_events" FOR EACH ROW EXECUTE FUNCTION audit_capture();
