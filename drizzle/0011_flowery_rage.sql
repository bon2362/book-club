ALTER TABLE "user" ADD COLUMN "created_at" timestamp;--> statement-breakpoint

UPDATE "user" u
SET "created_at" = COALESCE(
  (
    SELECT MIN(activity_at)
    FROM (
      SELECT u."emailVerified" AS activity_at
      UNION ALL SELECT u."last_sign_in_at"
      UNION ALL SELECT MIN(sb."signed_at") FROM "signup_books" sb WHERE sb."user_id" = u."id"
      UNION ALL SELECT MIN(bp."updated_at") FROM "book_priorities" bp WHERE bp."user_id" = u."id"
      UNION ALL SELECT MIN(bs."created_at") FROM "book_submissions" bs WHERE bs."user_id" = u."id"
      UNION ALL SELECT MIN(f."created_at") FROM "feedback" f WHERE f."user_id" = u."id"
    ) dates
    WHERE activity_at IS NOT NULL
  ),
  now()
);--> statement-breakpoint

ALTER TABLE "user" ALTER COLUMN "created_at" SET DEFAULT now();--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
