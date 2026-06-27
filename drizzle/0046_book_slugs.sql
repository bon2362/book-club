ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "slug" text;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "books_slug_unique" ON "books" ("slug");
