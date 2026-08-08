-- Circle and formation sizes are fixed product rules, not session settings.
ALTER TABLE "matching_sessions" DROP CONSTRAINT IF EXISTS "matching_sessions_group_size_range_check";
--> statement-breakpoint
ALTER TABLE "matching_sessions" DROP COLUMN IF EXISTS "min_group_size";
--> statement-breakpoint
ALTER TABLE "matching_sessions" DROP COLUMN IF EXISTS "max_group_size";
