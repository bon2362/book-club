-- Final cleanup for the identity refactor.
--
-- Runtime auth uses JWT sessions and user_identities as the source of truth for
-- provider accounts. Refuse to drop Auth.js compatibility tables until the
-- production data is known to be safe.
DO $$
DECLARE
  session_rows integer;
  account_rows_without_identity integer;
BEGIN
  SELECT count(*) INTO session_rows
  FROM "session";

  IF session_rows > 0 THEN
    RAISE EXCEPTION 'Refusing to drop session: % rows still exist.', session_rows;
  END IF;

  SELECT count(*) INTO account_rows_without_identity
  FROM "account" a
  LEFT JOIN "user_identities" ui
    ON ui."provider" = a."provider"
   AND ui."provider_account_id" = a."providerAccountId"
   AND ui."user_id" = a."userId"
  WHERE ui."id" IS NULL;

  IF account_rows_without_identity > 0 THEN
    RAISE EXCEPTION 'Refusing to drop account: % rows are missing matching user_identities.', account_rows_without_identity;
  END IF;
END $$;

DROP TABLE IF EXISTS "session";
DROP TABLE IF EXISTS "account";
