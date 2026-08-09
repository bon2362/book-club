-- Circle calendar: global user availability, circle schedule pages and meetings.
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "timezone" text;
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "timezone_confirmed" boolean NOT NULL DEFAULT false;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_availability" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "starts_at" timestamp with time zone NOT NULL,
  "ends_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "user_availability_order_check" CHECK ("ends_at" > "starts_at"),
  CONSTRAINT "user_availability_aligned_check" CHECK (
    date_part('minute', "starts_at") IN (0, 30)
    AND date_part('second', "starts_at") = 0
    AND date_part('minute', "ends_at") IN (0, 30)
    AND date_part('second', "ends_at") = 0
  )
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "user_availability_user_start_idx" ON "user_availability" ("user_id", "starts_at");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "circle_schedules" (
  "id" text PRIMARY KEY NOT NULL,
  "session_id" text NOT NULL REFERENCES "matching_sessions"("id") ON DELETE CASCADE,
  "book_id" text NOT NULL REFERENCES "books"("id") ON DELETE RESTRICT,
  "position" integer NOT NULL,
  "slug" text NOT NULL,
  "duration_minutes" integer NOT NULL DEFAULT 60,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT "circle_schedules_position_check" CHECK ("position" >= 1),
  CONSTRAINT "circle_schedules_duration_check" CHECK ("duration_minutes" >= 30 AND "duration_minutes" % 30 = 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "circle_schedules_slug_uniq" ON "circle_schedules" ("slug");
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "circle_schedules_session_book_position_uniq" ON "circle_schedules" ("session_id", "book_id", "position");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "circle_meetings" (
  "id" text PRIMARY KEY NOT NULL,
  "schedule_id" text NOT NULL REFERENCES "circle_schedules"("id") ON DELETE CASCADE,
  "starts_at" timestamp with time zone NOT NULL,
  "duration_minutes" integer NOT NULL,
  "created_by" text REFERENCES "user"("id") ON DELETE SET NULL,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "canceled_at" timestamp with time zone,
  "canceled_by" text REFERENCES "user"("id") ON DELETE SET NULL,
  CONSTRAINT "circle_meetings_duration_check" CHECK ("duration_minutes" >= 30 AND "duration_minutes" % 30 = 0),
  CONSTRAINT "circle_meetings_aligned_check" CHECK (
    date_part('minute', "starts_at") IN (0, 30) AND date_part('second', "starts_at") = 0
  )
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "circle_meetings_schedule_start_idx" ON "circle_meetings" ("schedule_id", "starts_at");
--> statement-breakpoint
CREATE TRIGGER audit_user_availability AFTER INSERT OR UPDATE OR DELETE ON "user_availability" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_circle_schedules AFTER INSERT OR UPDATE OR DELETE ON "circle_schedules" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_circle_meetings AFTER INSERT OR UPDATE OR DELETE ON "circle_meetings" FOR EACH ROW EXECUTE FUNCTION audit_capture();
