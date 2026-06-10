CREATE TABLE IF NOT EXISTS "audit_log" (
  "id" text PRIMARY KEY NOT NULL,
  "occurred_at" timestamp DEFAULT now() NOT NULL,
  "actor_user_id" text,
  "actor_label" text,
  "source" text NOT NULL,
  "action" text NOT NULL,
  "entity_type" text NOT NULL,
  "entity_id" text,
  "before" jsonb,
  "after" jsonb,
  "changed_fields" jsonb,
  "reason" text,
  "metadata" jsonb
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_entity_idx"
  ON "audit_log" USING btree ("entity_type","entity_id","occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_actor_idx"
  ON "audit_log" USING btree ("actor_user_id","occurred_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_log_occurred_at_idx"
  ON "audit_log" USING btree ("occurred_at");
