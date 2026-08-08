-- Scenario mode is permanently retired. Import every still-locked legacy
-- circle before removing its source tables. This also makes deployments safe
-- when an active/frozen session still uses the pre-book-mode lifecycle.
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "matching_locked_circles" legacy_circle
		WHERE legacy_circle."status" = 'locked'
		  AND NOT EXISTS (
			SELECT 1
			FROM "matching_locked_circle_members" legacy_member
			WHERE legacy_member."circle_id" = legacy_circle."id"
			  AND legacy_member."released_at" IS NULL
		  )
	) THEN
		RAISE EXCEPTION 'cannot remove matching scenarios: locked circle has no active members';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "matching_locked_circle_members" legacy_member
		JOIN "matching_locked_circles" legacy_circle ON legacy_circle."id" = legacy_member."circle_id"
		WHERE legacy_circle."status" = 'locked'
		  AND legacy_member."released_at" IS NULL
		  AND (
			legacy_member."session_id" <> legacy_circle."session_id"
			OR NOT EXISTS (
				SELECT 1
				FROM "matching_session_participants" participant
				WHERE participant."session_id" = legacy_circle."session_id"
				  AND participant."user_id" = legacy_member."user_id"
			)
		  )
	) THEN
		RAISE EXCEPTION 'cannot remove matching scenarios: locked circle member is not a session participant';
	END IF;

	IF EXISTS (
		SELECT 1
		FROM "matching_locked_circle_members" legacy_member
		JOIN "matching_locked_circles" legacy_circle ON legacy_circle."id" = legacy_member."circle_id"
		JOIN "matching_sessions" session ON session."id" = legacy_circle."session_id"
		JOIN "signup_books" signup
		  ON signup."user_id" = legacy_member."user_id"
		 AND signup."book_id" = legacy_circle."book_id"
		WHERE legacy_circle."status" = 'locked'
		  AND legacy_member."released_at" IS NULL
		  AND session."status" IN ('active', 'open')
		  AND signup."personal_status" IS NOT NULL
	) THEN
		RAISE EXCEPTION 'cannot remove matching scenarios: locked circle book is no longer shortlisted';
	END IF;
END;
$$;
--> statement-breakpoint
SET LOCAL app.audit_source = 'system';
--> statement-breakpoint
SET LOCAL app.audit_actor = '';
--> statement-breakpoint
SET LOCAL app.audit_label = '';
--> statement-breakpoint
SET LOCAL app.audit_reason = 'import locked circles before removing matching scenarios';
--> statement-breakpoint
INSERT INTO "signup_books" ("user_id", "book_id")
SELECT DISTINCT legacy_member."user_id", legacy_circle."book_id"
FROM "matching_locked_circle_members" legacy_member
JOIN "matching_locked_circles" legacy_circle ON legacy_circle."id" = legacy_member."circle_id"
WHERE legacy_circle."status" = 'locked'
  AND legacy_member."released_at" IS NULL
ON CONFLICT ("user_id", "book_id") DO NOTHING;
--> statement-breakpoint
WITH missing_priorities AS (
	SELECT DISTINCT legacy_member."user_id", legacy_circle."book_id"
	FROM "matching_locked_circle_members" legacy_member
	JOIN "matching_locked_circles" legacy_circle ON legacy_circle."id" = legacy_member."circle_id"
	LEFT JOIN "book_priorities" priority
	  ON priority."user_id" = legacy_member."user_id"
	 AND priority."book_id" = legacy_circle."book_id"
	WHERE legacy_circle."status" = 'locked'
	  AND legacy_member."released_at" IS NULL
	  AND priority."user_id" IS NULL
), ranked_missing AS (
	SELECT missing."user_id", missing."book_id",
		ROW_NUMBER() OVER (PARTITION BY missing."user_id" ORDER BY missing."book_id") AS offset
	FROM missing_priorities missing
)
INSERT INTO "book_priorities" ("user_id", "book_id", "rank", "rank_source")
SELECT missing."user_id", missing."book_id",
	COALESCE((SELECT MAX(existing."rank") FROM "book_priorities" existing WHERE existing."user_id" = missing."user_id"), 0) + missing.offset,
	'auto'
FROM ranked_missing missing
ON CONFLICT ("user_id", "book_id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "matching_session_book_states" ("session_id", "book_id", "formed_state_version")
SELECT DISTINCT legacy_circle."session_id", legacy_circle."book_id", session."state_version"
FROM "matching_locked_circles" legacy_circle
JOIN "matching_sessions" session ON session."id" = legacy_circle."session_id"
WHERE legacy_circle."status" = 'locked'
ON CONFLICT ("session_id", "book_id") DO NOTHING;
--> statement-breakpoint
WITH missing_circles AS (
	SELECT legacy_circle.*,
		ROW_NUMBER() OVER (
			PARTITION BY legacy_circle."session_id", legacy_circle."book_id"
			ORDER BY legacy_circle."locked_at", legacy_circle."id"
		) AS position_offset
	FROM "matching_locked_circles" legacy_circle
	LEFT JOIN "matching_circles" existing ON existing."legacy_locked_circle_id" = legacy_circle."id"
	WHERE legacy_circle."status" = 'locked'
	  AND existing."id" IS NULL
), positioned_circles AS (
	SELECT missing.*,
		COALESCE((
			SELECT MAX(existing."position")
			FROM "matching_circles" existing
			WHERE existing."session_id" = missing."session_id"
			  AND existing."book_id" = missing."book_id"
		), 0) + missing.position_offset AS canonical_position
	FROM missing_circles missing
)
INSERT INTO "matching_circles" ("id", "session_id", "book_id", "position", "legacy_locked_circle_id")
SELECT 'legacy:' || legacy_circle."id", legacy_circle."session_id", legacy_circle."book_id",
	legacy_circle.canonical_position, legacy_circle."id"
FROM positioned_circles legacy_circle
ON CONFLICT ("legacy_locked_circle_id") DO NOTHING;
--> statement-breakpoint
INSERT INTO "matching_book_assignments" ("session_id", "user_id", "book_id", "source", "circle_id")
SELECT legacy_circle."session_id", legacy_member."user_id", legacy_circle."book_id", 'legacy', book_circle."id"
FROM "matching_locked_circle_members" legacy_member
JOIN "matching_locked_circles" legacy_circle ON legacy_circle."id" = legacy_member."circle_id"
JOIN "matching_circles" book_circle ON book_circle."legacy_locked_circle_id" = legacy_circle."id"
WHERE legacy_circle."status" = 'locked'
  AND legacy_member."released_at" IS NULL
ON CONFLICT ("session_id", "user_id") DO NOTHING;
--> statement-breakpoint
-- Exact equality in both directions is the final gate before destructive cleanup.
DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "matching_locked_circles" legacy_circle
		WHERE legacy_circle."status" = 'locked'
		  AND NOT EXISTS (
			SELECT 1
			FROM "matching_circles" book_circle
			WHERE book_circle."legacy_locked_circle_id" = legacy_circle."id"
			  AND book_circle."session_id" = legacy_circle."session_id"
			  AND book_circle."book_id" = legacy_circle."book_id"
			  AND NOT EXISTS (
				SELECT 1
				FROM "matching_locked_circle_members" legacy_member
				WHERE legacy_member."circle_id" = legacy_circle."id"
				  AND legacy_member."released_at" IS NULL
				  AND NOT EXISTS (
					SELECT 1
					FROM "matching_book_assignments" assignment
					WHERE assignment."circle_id" = book_circle."id"
					  AND assignment."session_id" = legacy_circle."session_id"
					  AND assignment."book_id" = legacy_circle."book_id"
					  AND assignment."user_id" = legacy_member."user_id"
				  )
			  )
			  AND NOT EXISTS (
				SELECT 1
				FROM "matching_book_assignments" assignment
				WHERE assignment."circle_id" = book_circle."id"
				  AND NOT EXISTS (
					SELECT 1
					FROM "matching_locked_circle_members" legacy_member
					WHERE legacy_member."circle_id" = legacy_circle."id"
					  AND legacy_member."released_at" IS NULL
					  AND legacy_member."user_id" = assignment."user_id"
				  )
			  )
		  )
	) THEN
		RAISE EXCEPTION 'cannot remove matching scenarios: imported circle membership differs';
	END IF;
END;
$$;
--> statement-breakpoint
-- Keep the shortlist protection, but the canonical book model is now the
-- only mode and therefore needs no cutover-marker check.
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
			SELECT "id"
			FROM "matching_sessions"
			WHERE "status" = 'open'
			ORDER BY "created_at" DESC, "id" DESC
			LIMIT 1
		)
		SELECT 1
		FROM current_session
		WHERE EXISTS (
			SELECT 1 FROM "matching_book_intents"
			WHERE "session_id" = current_session."id"
			  AND "user_id" = v_user_id AND "book_id" = v_book_id AND "kind" = 'hard'
		) OR EXISTS (
			SELECT 1 FROM "matching_book_assignments"
			WHERE "session_id" = current_session."id"
			  AND "user_id" = v_user_id AND "book_id" = v_book_id
		)
	) THEN
		RAISE EXCEPTION 'current matching hard choice or assignment protects this shortlist book'
			USING ERRCODE = '23514';
	END IF;

	IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
UPDATE "matching_sessions" SET "status" = 'open' WHERE "status" = 'active';
--> statement-breakpoint
UPDATE "matching_sessions" SET "status" = 'closed' WHERE "status" = 'frozen';
--> statement-breakpoint
ALTER TABLE "matching_sessions" DROP CONSTRAINT IF EXISTS "matching_sessions_book_mode_lifecycle_check";
--> statement-breakpoint
ALTER TABLE "matching_sessions" DROP CONSTRAINT IF EXISTS "matching_sessions_status_check";
--> statement-breakpoint
ALTER TABLE "matching_sessions" ADD CONSTRAINT "matching_sessions_status_check" CHECK ("status" IN ('open', 'closed'));
--> statement-breakpoint
DROP INDEX IF EXISTS "matching_sessions_single_active_idx";
--> statement-breakpoint
CREATE UNIQUE INDEX "matching_sessions_single_active_idx" ON "matching_sessions" USING btree ((true)) WHERE "status" = 'open';
--> statement-breakpoint
ALTER TABLE "matching_circles" DROP CONSTRAINT IF EXISTS "matching_circles_legacy_locked_circle_id_matching_locked_circles_id_fk";
--> statement-breakpoint
DROP INDEX IF EXISTS "matching_circles_legacy_locked_circle_uniq";
--> statement-breakpoint
ALTER TABLE "matching_circles" DROP COLUMN IF EXISTS "legacy_locked_circle_id";
--> statement-breakpoint
DROP TABLE IF EXISTS "matching_circle_confirmations";
--> statement-breakpoint
DROP TABLE IF EXISTS "matching_locked_circle_members";
--> statement-breakpoint
DROP TABLE IF EXISTS "matching_locked_circles";
--> statement-breakpoint
DROP FUNCTION IF EXISTS guard_initialized_matching_legacy_write();
--> statement-breakpoint
ALTER TABLE "matching_sessions" DROP COLUMN IF EXISTS "frozen_at";
--> statement-breakpoint
ALTER TABLE "matching_sessions" DROP COLUMN IF EXISTS "frozen_scenario_json";
--> statement-breakpoint
ALTER TABLE "matching_sessions" DROP COLUMN IF EXISTS "book_mode_initialized_at";
