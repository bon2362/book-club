DROP TABLE IF EXISTS "matching_pseudonym_reservations";
--> statement-breakpoint
DROP TABLE IF EXISTS "matching_preference_events";
--> statement-breakpoint
ALTER TABLE "matching_sessions" DROP COLUMN IF EXISTS "optimization_mode";
--> statement-breakpoint
ALTER TABLE "matching_sessions" DROP COLUMN IF EXISTS "metric_groups_count";
--> statement-breakpoint
ALTER TABLE "matching_sessions" DROP COLUMN IF EXISTS "metric_coverage";
--> statement-breakpoint
ALTER TABLE "matching_sessions" DROP COLUMN IF EXISTS "metric_time_to_freeze_seconds";
--> statement-breakpoint
ALTER TABLE "matching_sessions" DROP COLUMN IF EXISTS "metric_time_since_last_mutation_seconds";
--> statement-breakpoint
ALTER TABLE "matching_sessions" DROP COLUMN IF EXISTS "metric_top3_hit_rate";
--> statement-breakpoint
ALTER TABLE "matching_session_participants" DROP COLUMN IF EXISTS "pseudonym";
