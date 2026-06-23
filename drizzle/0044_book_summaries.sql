CREATE TABLE IF NOT EXISTS "book_summaries" (
	"id" text PRIMARY KEY NOT NULL,
	"book_id" text NOT NULL,
	"author_user_id" text NOT NULL,
	"display_name" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"tldr" text DEFAULT '' NOT NULL,
	"body_markdown" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"rejection_reason" text,
	"submitted_at" timestamp,
	"published_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "book_summaries_book_id_books_id_fk" FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade ON UPDATE no action,
	CONSTRAINT "book_summaries_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "book_summaries_book_author_unique" ON "book_summaries" ("book_id","author_user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "book_summaries_book_status_idx" ON "book_summaries" ("book_id","status");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "book_summaries_author_status_idx" ON "book_summaries" ("author_user_id","status");
--> statement-breakpoint
CREATE TRIGGER audit_book_summaries AFTER INSERT OR UPDATE OR DELETE ON "book_summaries" FOR EACH ROW EXECUTE FUNCTION audit_capture();
