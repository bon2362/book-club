ALTER TABLE "matching_session_participants" ADD COLUMN "last_seen_at" timestamp NOT NULL DEFAULT now();
--> statement-breakpoint
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

  -- Не логируем чисто телеметрические апдейты (последний визит / последний онлайн):
  -- это шум; реальные изменения учётки (email/имя/is_admin/контакты) логируются.
  IF TG_OP = 'UPDATE' AND v_changed IS NOT NULL THEN
    IF TG_TABLE_NAME = 'user' AND v_changed <@ '["last_activity_at"]'::jsonb THEN
      RETURN NEW;
    END IF;
    IF TG_TABLE_NAME = 'user_identities' AND v_changed <@ '["last_seen_at"]'::jsonb THEN
      RETURN NEW;
    END IF;
    IF TG_TABLE_NAME = 'matching_session_participants' AND v_changed <@ '["last_seen_at"]'::jsonb THEN
      RETURN NEW;
    END IF;
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
