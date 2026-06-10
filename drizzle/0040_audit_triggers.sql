CREATE OR REPLACE FUNCTION audit_capture() RETURNS trigger AS $$
DECLARE
  v_before jsonb;
  v_after jsonb;
  v_changed jsonb;
  v_entity_id text;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    v_before := to_jsonb(OLD); v_after := NULL;
  ELSIF (TG_OP = 'UPDATE') THEN
    v_before := to_jsonb(OLD); v_after := to_jsonb(NEW);
  ELSE
    v_before := NULL; v_after := to_jsonb(NEW);
  END IF;

  IF TG_TABLE_NAME = 'verificationToken' THEN
    v_before := v_before - 'token'; v_after := v_after - 'token';
  ELSIF TG_TABLE_NAME = 'telegram_preauth_tokens' THEN
    v_before := v_before - 'token_hash'; v_after := v_after - 'token_hash';
  END IF;

  IF (TG_OP = 'UPDATE') THEN
    SELECT jsonb_agg(e.key) INTO v_changed
    FROM jsonb_each(v_after) AS e
    WHERE v_after -> e.key IS DISTINCT FROM v_before -> e.key;
  END IF;

  v_entity_id := COALESCE(
    v_after ->> 'id',
    v_before ->> 'id',
    NULLIF(concat_ws(':',
      COALESCE(v_after ->> 'session_id', v_before ->> 'session_id'),
      COALESCE(v_after ->> 'user_id',    v_before ->> 'user_id'),
      COALESCE(v_after ->> 'book_id',    v_before ->> 'book_id')
    ), ''),
    v_after ->> 'tag',        v_before ->> 'tag',         -- tag_descriptions
    v_after ->> 'identifier', v_before ->> 'identifier'   -- verificationToken (token уже замаскирован)
  );

  INSERT INTO audit_log
    (id, actor_user_id, actor_label, source, action, entity_type, entity_id, before, after, changed_fields, reason)
  VALUES (
    gen_random_uuid()::text,
    NULLIF(current_setting('app.audit_actor', true), ''),
    NULLIF(current_setting('app.audit_label', true), ''),
    COALESCE(NULLIF(current_setting('app.audit_source', true), ''), 'trigger'),
    lower(TG_OP),
    TG_TABLE_NAME,
    v_entity_id,
    v_before,
    v_after,
    v_changed,
    NULLIF(current_setting('app.audit_reason', true), '')
  );

  IF (TG_OP = 'DELETE') THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER audit_books AFTER INSERT OR UPDATE OR DELETE ON "books" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_user AFTER INSERT OR UPDATE OR DELETE ON "user" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_book_priorities AFTER INSERT OR UPDATE OR DELETE ON "book_priorities" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_book_submissions AFTER INSERT OR UPDATE OR DELETE ON "book_submissions" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_intro_sections AFTER INSERT OR UPDATE OR DELETE ON "intro_sections" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_signup_books AFTER INSERT OR UPDATE OR DELETE ON "signup_books" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_feedback AFTER INSERT OR UPDATE OR DELETE ON "feedback" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_tag_descriptions AFTER INSERT OR UPDATE OR DELETE ON "tag_descriptions" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_matching_sessions AFTER INSERT OR UPDATE OR DELETE ON "matching_sessions" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_matching_session_participants AFTER INSERT OR UPDATE OR DELETE ON "matching_session_participants" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_matching_pseudonym_reservations AFTER INSERT OR UPDATE OR DELETE ON "matching_pseudonym_reservations" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_matching_preference_events AFTER INSERT OR UPDATE OR DELETE ON "matching_preference_events" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_user_activity_events AFTER INSERT OR UPDATE OR DELETE ON "user_activity_events" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_user_identities AFTER INSERT OR UPDATE OR DELETE ON "user_identities" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_verificationToken AFTER INSERT OR UPDATE OR DELETE ON "verificationToken" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_telegram_preauth_tokens AFTER INSERT OR UPDATE OR DELETE ON "telegram_preauth_tokens" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_notification_queue AFTER INSERT OR UPDATE OR DELETE ON "notification_queue" FOR EACH ROW EXECUTE FUNCTION audit_capture();
