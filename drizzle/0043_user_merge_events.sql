CREATE TABLE "user_merge_events" (
  "id" text PRIMARY KEY DEFAULT gen_random_uuid()::text NOT NULL,
  "occurred_at" timestamp DEFAULT now() NOT NULL,
  "actor_user_id" text,
  "source_user_id" text NOT NULL,
  "target_user_id" text NOT NULL,
  "reason" text NOT NULL,
  "source_snapshot" jsonb NOT NULL,
  "target_snapshot" jsonb NOT NULL,
  "moved_counts" jsonb NOT NULL
);
--> statement-breakpoint
CREATE INDEX "user_merge_events_occurred_at_idx" ON "user_merge_events" USING btree ("occurred_at");
--> statement-breakpoint
CREATE INDEX "user_merge_events_target_user_id_idx" ON "user_merge_events" USING btree ("target_user_id","occurred_at");
--> statement-breakpoint
CREATE INDEX "user_merge_events_source_user_id_idx" ON "user_merge_events" USING btree ("source_user_id","occurred_at");
--> statement-breakpoint
CREATE TRIGGER audit_user_merge_events AFTER INSERT OR UPDATE OR DELETE ON "user_merge_events" FOR EACH ROW EXECUTE FUNCTION audit_capture();
