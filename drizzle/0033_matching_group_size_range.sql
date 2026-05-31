ALTER TABLE "matching_sessions"
  ADD COLUMN "min_group_size" integer DEFAULT 3 NOT NULL,
  ADD COLUMN "max_group_size" integer DEFAULT 3 NOT NULL;
--> statement-breakpoint
UPDATE "matching_sessions"
SET
  "min_group_size" = 3,
  "max_group_size" = 3;
--> statement-breakpoint
ALTER TABLE "matching_sessions"
  ADD CONSTRAINT "matching_sessions_group_size_range_check"
  CHECK ("min_group_size" >= 2 AND "max_group_size" >= "min_group_size" AND "max_group_size" <= 10);
--> statement-breakpoint
ALTER TABLE "matching_sessions"
  DROP COLUMN "target_group_size";
