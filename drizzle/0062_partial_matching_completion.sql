ALTER TABLE "matching_session_participants"
  ADD COLUMN IF NOT EXISTS "completed_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "matching_session_participants"
  ADD COLUMN IF NOT EXISTS "completed_circle_id" text;
--> statement-breakpoint
ALTER TABLE "matching_session_participants"
  ADD CONSTRAINT "matching_session_participants_completed_circle_id_fk"
  FOREIGN KEY ("completed_circle_id") REFERENCES "matching_circles"("id") ON DELETE SET NULL;
