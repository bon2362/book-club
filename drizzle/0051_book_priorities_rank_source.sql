ALTER TABLE "book_priorities" ADD COLUMN IF NOT EXISTS "rank_source" text NOT NULL DEFAULT 'auto';
