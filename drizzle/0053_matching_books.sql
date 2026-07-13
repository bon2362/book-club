ALTER TABLE "matching_sessions" ADD COLUMN "book_mode_initialized_at" timestamp;
--> statement-breakpoint
ALTER TABLE "matching_sessions" ADD CONSTRAINT "matching_sessions_status_check" CHECK ("status" IN ('active', 'frozen', 'open', 'closed'));
--> statement-breakpoint
ALTER TABLE "matching_sessions" ADD CONSTRAINT "matching_sessions_book_mode_lifecycle_check" CHECK ("book_mode_initialized_at" IS NULL OR "status" IN ('open', 'closed'));
--> statement-breakpoint
DROP INDEX IF EXISTS "matching_sessions_single_active_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX "matching_sessions_single_active_idx" ON "matching_sessions" USING btree ((true)) WHERE "status" IN ('active', 'open');
--> statement-breakpoint
CREATE TABLE "matching_book_intents" (
	"session_id" text NOT NULL,
	"user_id" text NOT NULL,
	"book_id" text NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "matching_book_intents_session_user_book_pk" PRIMARY KEY("session_id","user_id","book_id"),
	CONSTRAINT "matching_book_intents_kind_check" CHECK ("matching_book_intents"."kind" IN ('conditional', 'hard'))
);
--> statement-breakpoint
CREATE TABLE "matching_session_book_states" (
	"session_id" text NOT NULL,
	"book_id" text NOT NULL,
	"formed_at" timestamp DEFAULT now() NOT NULL,
	"formed_state_version" integer NOT NULL,
	CONSTRAINT "matching_session_book_states_session_book_pk" PRIMARY KEY("session_id","book_id"),
	CONSTRAINT "matching_session_book_states_formed_state_version_check" CHECK ("matching_session_book_states"."formed_state_version" >= 0)
);
--> statement-breakpoint
CREATE TABLE "matching_circles" (
	"id" text PRIMARY KEY NOT NULL,
	"session_id" text NOT NULL,
	"book_id" text NOT NULL,
	"position" integer NOT NULL,
	"legacy_locked_circle_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "matching_circles_position_check" CHECK ("matching_circles"."position" >= 1)
);
--> statement-breakpoint
CREATE TABLE "matching_book_assignments" (
	"session_id" text NOT NULL,
	"user_id" text NOT NULL,
	"book_id" text NOT NULL,
	"source" text NOT NULL,
	"assigned_at" timestamp DEFAULT now() NOT NULL,
	"assigned_by" text,
	"circle_id" text,
	CONSTRAINT "matching_book_assignments_session_user_pk" PRIMARY KEY("session_id","user_id"),
	CONSTRAINT "matching_book_assignments_source_check" CHECK ("matching_book_assignments"."source" IN ('hard', 'conditional', 'admin', 'legacy'))
);
--> statement-breakpoint
ALTER TABLE "matching_book_intents" ADD CONSTRAINT "matching_book_intents_session_user_fk" FOREIGN KEY ("session_id","user_id") REFERENCES "public"."matching_session_participants"("session_id","user_id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "matching_book_intents" ADD CONSTRAINT "matching_book_intents_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "matching_session_book_states" ADD CONSTRAINT "matching_session_book_states_session_id_matching_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."matching_sessions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "matching_session_book_states" ADD CONSTRAINT "matching_session_book_states_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "matching_circles" ADD CONSTRAINT "matching_circles_session_id_matching_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."matching_sessions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "matching_circles" ADD CONSTRAINT "matching_circles_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "matching_circles" ADD CONSTRAINT "matching_circles_legacy_locked_circle_id_matching_locked_circles_id_fk" FOREIGN KEY ("legacy_locked_circle_id") REFERENCES "public"."matching_locked_circles"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "matching_book_assignments" ADD CONSTRAINT "matching_book_assignments_session_user_fk" FOREIGN KEY ("session_id","user_id") REFERENCES "public"."matching_session_participants"("session_id","user_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "matching_book_assignments" ADD CONSTRAINT "matching_book_assignments_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."matching_sessions"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "matching_book_assignments" ADD CONSTRAINT "matching_book_assignments_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE restrict ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "matching_book_assignments" ADD CONSTRAINT "matching_book_assignments_assigned_by_user_id_fk" FOREIGN KEY ("assigned_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "matching_book_intents_session_user_hard_uniq" ON "matching_book_intents" USING btree ("session_id","user_id") WHERE "kind" = 'hard';
--> statement-breakpoint
CREATE INDEX "matching_book_intents_session_book_kind_created_idx" ON "matching_book_intents" USING btree ("session_id","book_id","kind","created_at");
--> statement-breakpoint
CREATE UNIQUE INDEX "matching_circles_id_session_book_uniq" ON "matching_circles" USING btree ("id","session_id","book_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "matching_circles_session_book_position_uniq" ON "matching_circles" USING btree ("session_id","book_id","position");
--> statement-breakpoint
CREATE UNIQUE INDEX "matching_circles_legacy_locked_circle_uniq" ON "matching_circles" USING btree ("legacy_locked_circle_id");
--> statement-breakpoint
ALTER TABLE "matching_book_assignments" ADD CONSTRAINT "matching_book_assignments_circle_session_book_fk" FOREIGN KEY ("circle_id","session_id","book_id") REFERENCES "public"."matching_circles"("id","session_id","book_id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE INDEX "matching_book_assignments_session_book_assigned_idx" ON "matching_book_assignments" USING btree ("session_id","book_id","assigned_at","user_id");
--> statement-breakpoint
CREATE TRIGGER audit_matching_book_intents AFTER INSERT OR UPDATE OR DELETE ON "matching_book_intents" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_matching_session_book_states AFTER INSERT OR UPDATE OR DELETE ON "matching_session_book_states" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_matching_book_assignments AFTER INSERT OR UPDATE OR DELETE ON "matching_book_assignments" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_matching_circles AFTER INSERT OR UPDATE OR DELETE ON "matching_circles" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_initialized_matching_legacy_write() RETURNS trigger AS $$
DECLARE
	v_session_id text;
BEGIN
	IF current_setting('app.matching_legacy_cleanup', true) = 'on' THEN
		IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
	END IF;

	v_session_id := CASE WHEN TG_OP = 'DELETE' THEN OLD.session_id ELSE NEW.session_id END;

	IF EXISTS (
		SELECT 1
		FROM "matching_sessions"
		WHERE "id" = v_session_id
		  AND "book_mode_initialized_at" IS NOT NULL
	) THEN
		RAISE EXCEPTION 'legacy matching state is read-only after book-mode initialization'
			USING ERRCODE = '23514';
	END IF;

	IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER guard_initialized_matching_circle_confirmations
BEFORE INSERT OR UPDATE OR DELETE ON "matching_circle_confirmations"
FOR EACH ROW EXECUTE FUNCTION guard_initialized_matching_legacy_write();
--> statement-breakpoint
CREATE TRIGGER guard_initialized_matching_locked_circles
BEFORE INSERT OR UPDATE OR DELETE ON "matching_locked_circles"
FOR EACH ROW EXECUTE FUNCTION guard_initialized_matching_legacy_write();
--> statement-breakpoint
CREATE TRIGGER guard_initialized_matching_locked_circle_members
BEFORE INSERT OR UPDATE OR DELETE ON "matching_locked_circle_members"
FOR EACH ROW EXECUTE FUNCTION guard_initialized_matching_legacy_write();
--> statement-breakpoint
CREATE OR REPLACE FUNCTION guard_current_matching_signup_binding() RETURNS trigger AS $$
DECLARE
	v_user_id text;
	v_book_id text;
BEGIN
	IF TG_OP = 'UPDATE'
	   AND NEW.user_id IS NOT DISTINCT FROM OLD.user_id
	   AND NEW.book_id IS NOT DISTINCT FROM OLD.book_id
	   AND NOT (OLD.personal_status IS NULL AND NEW.personal_status IS NOT NULL) THEN
		RETURN NEW;
	END IF;

	v_user_id := OLD.user_id;
	v_book_id := OLD.book_id;

	IF EXISTS (
		WITH current_session AS (
			SELECT "id", "book_mode_initialized_at"
			FROM "matching_sessions"
			WHERE "status" IN ('active', 'frozen', 'open', 'closed')
			ORDER BY
				CASE WHEN "status" IN ('active', 'open') THEN 0 ELSE 1 END,
				"created_at" DESC,
				"id" DESC
			LIMIT 1
		)
		SELECT 1
		FROM current_session
		WHERE "book_mode_initialized_at" IS NOT NULL
		  AND (
			EXISTS (
				SELECT 1
				FROM "matching_book_intents"
				WHERE "session_id" = current_session."id"
				  AND "user_id" = v_user_id
				  AND "book_id" = v_book_id
				  AND "kind" = 'hard'
			)
			OR EXISTS (
				SELECT 1
				FROM "matching_book_assignments"
				WHERE "session_id" = current_session."id"
				  AND "user_id" = v_user_id
				  AND "book_id" = v_book_id
			)
		  )
	) THEN
		RAISE EXCEPTION 'current matching hard choice or assignment protects this shortlist book'
			USING ERRCODE = '23514';
	END IF;

	IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER guard_current_matching_signup_binding
BEFORE DELETE OR UPDATE OF "user_id", "book_id", "personal_status" ON "signup_books"
FOR EACH ROW EXECUTE FUNCTION guard_current_matching_signup_binding();
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
  ELSIF TG_TABLE_NAME = 'book_summary_helpful_reactions' THEN
    v_before := v_before - 'visitor_hash'; v_after := v_after - 'visitor_hash';
  END IF;

  IF (TG_OP = 'UPDATE') THEN
    SELECT jsonb_agg(e.key) INTO v_changed
    FROM jsonb_each(v_after) AS e
    WHERE v_after -> e.key IS DISTINCT FROM v_before -> e.key;
  END IF;

  IF TG_OP = 'UPDATE' AND v_changed IS NOT NULL THEN
    IF TG_TABLE_NAME = 'user' AND v_changed <@ '["last_activity_at"]'::jsonb THEN RETURN NEW; END IF;
    IF TG_TABLE_NAME = 'user_identities' AND v_changed <@ '["last_seen_at"]'::jsonb THEN RETURN NEW; END IF;
    IF TG_TABLE_NAME = 'matching_session_participants' AND v_changed <@ '["last_seen_at"]'::jsonb THEN RETURN NEW; END IF;
  END IF;

  IF TG_TABLE_NAME = 'matching_book_assignments' THEN
    v_entity_id := concat_ws(':',
      COALESCE(v_after ->> 'session_id', v_before ->> 'session_id'),
      COALESCE(v_after ->> 'user_id', v_before ->> 'user_id')
    );
  ELSE
    v_entity_id := COALESCE(
      v_after ->> 'id', v_before ->> 'id',
      NULLIF(concat_ws(':',
        COALESCE(v_after ->> 'session_id', v_before ->> 'session_id'),
        COALESCE(v_after ->> 'user_id', v_before ->> 'user_id'),
        COALESCE(v_after ->> 'book_id', v_before ->> 'book_id')
      ), ''),
      v_after ->> 'tag', v_before ->> 'tag',
      v_after ->> 'identifier', v_before ->> 'identifier'
    );
  END IF;

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

  IF (TG_OP = 'DELETE') THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;
