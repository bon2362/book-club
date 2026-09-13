CREATE TABLE IF NOT EXISTS "book_collections" (
  "id" text PRIMARY KEY,
  "slug" text,
  "author_user_id" text NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "display_name" text NOT NULL DEFAULT '',
  "title" text NOT NULL,
  "description_markdown" text NOT NULL DEFAULT '',
  "status" text NOT NULL DEFAULT 'draft',
  "moderation_reason" text,
  "submitted_at" timestamp,
  "edited_at" timestamp,
  "published_at" timestamp,
  "reviewed_at" timestamp,
  "reviewed_snapshot" jsonb,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now(),
  CONSTRAINT "book_collections_status_check" CHECK ("status" IN ('draft', 'pending', 'published', 'rejected', 'hidden'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "book_collections_slug_unique" ON "book_collections" ("slug");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "book_collections_author_idx" ON "book_collections" ("author_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "book_collections_status_idx" ON "book_collections" ("status");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "book_collection_items" (
  "id" text PRIMARY KEY,
  "collection_id" text NOT NULL REFERENCES "book_collections"("id") ON DELETE CASCADE,
  "book_id" text NOT NULL REFERENCES "books"("id") ON DELETE CASCADE,
  "position" integer NOT NULL,
  CONSTRAINT "book_collection_items_position_check" CHECK ("position" >= 1)
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "book_collection_items_collection_book_unique" ON "book_collection_items" ("collection_id", "book_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "book_collection_items_book_idx" ON "book_collection_items" ("book_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "site_settings" (
  "id" text PRIMARY KEY,
  "value" jsonb NOT NULL,
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TRIGGER audit_book_collections AFTER INSERT OR UPDATE OR DELETE ON "book_collections" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_book_collection_items AFTER INSERT OR UPDATE OR DELETE ON "book_collection_items" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_site_settings AFTER INSERT OR UPDATE OR DELETE ON "site_settings" FOR EACH ROW EXECUTE FUNCTION audit_capture();
