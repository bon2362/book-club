-- Participants may keep hard intents and assignments for any number of distinct books.
DROP INDEX IF EXISTS "matching_book_intents_session_user_hard_uniq";
--> statement-breakpoint
ALTER TABLE "matching_book_assignments"
  DROP CONSTRAINT IF EXISTS "matching_book_assignments_session_user_pk";
--> statement-breakpoint
ALTER TABLE "matching_book_assignments" ADD CONSTRAINT "matching_book_assignments_session_user_book_pk" PRIMARY KEY ("session_id", "user_id", "book_id");
--> statement-breakpoint
CREATE OR REPLACE FUNCTION audit_capture_matching_book_assignment() RETURNS trigger AS $$
DECLARE
  v_before jsonb;
  v_after jsonb;
  v_changed jsonb;
  v_entity_id text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_before := to_jsonb(OLD); v_after := NULL;
  ELSIF TG_OP = 'UPDATE' THEN
    v_before := to_jsonb(OLD); v_after := to_jsonb(NEW);
  ELSE
    v_before := NULL; v_after := to_jsonb(NEW);
  END IF;

  IF TG_OP = 'UPDATE' THEN
    SELECT jsonb_agg(e.key) INTO v_changed
    FROM jsonb_each(v_after) AS e
    WHERE v_after -> e.key IS DISTINCT FROM v_before -> e.key;
  END IF;

  v_entity_id := concat_ws(':',
    COALESCE(v_after ->> 'session_id', v_before ->> 'session_id'),
    COALESCE(v_after ->> 'user_id', v_before ->> 'user_id'),
    COALESCE(v_after ->> 'book_id', v_before ->> 'book_id')
  );

  INSERT INTO audit_log
    (id, actor_user_id, actor_label, source, action, entity_type, entity_id, before, after, changed_fields, reason)
  VALUES (
    gen_random_uuid()::text,
    NULLIF(current_setting('app.audit_actor', true), ''),
    NULLIF(current_setting('app.audit_label', true), ''),
    COALESCE(NULLIF(current_setting('app.audit_source', true), ''), 'trigger'),
    lower(TG_OP), TG_TABLE_NAME, v_entity_id, v_before, v_after, v_changed,
    NULLIF(current_setting('app.audit_reason', true), '')
  );

  IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
DROP TRIGGER IF EXISTS "audit_matching_book_assignments" ON "matching_book_assignments";
--> statement-breakpoint
CREATE TRIGGER audit_matching_book_assignments
AFTER INSERT OR UPDATE OR DELETE ON "matching_book_assignments"
FOR EACH ROW EXECUTE FUNCTION audit_capture_matching_book_assignment();
