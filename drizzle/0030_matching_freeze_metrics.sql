ALTER TABLE "matching_sessions"
  ADD COLUMN "metric_groups_count" integer,
  ADD COLUMN "metric_coverage" integer,
  ADD COLUMN "metric_time_to_freeze_seconds" integer,
  ADD COLUMN "metric_time_since_last_mutation_seconds" integer,
  ADD COLUMN "metric_top3_hit_rate" real;
