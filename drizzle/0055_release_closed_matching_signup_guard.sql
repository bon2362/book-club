-- Closed and frozen matching sessions are historical snapshots. Their hard
-- intents and assignments must remain stored, but they must no longer block
-- catalog status changes in signup_books.
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
			WHERE "status" IN ('active', 'open')
			ORDER BY "created_at" DESC, "id" DESC
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
