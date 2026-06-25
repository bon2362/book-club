CREATE TABLE IF NOT EXISTS "book_summary_revisions" (
	"id" text PRIMARY KEY NOT NULL,
	"summary_id" text NOT NULL,
	"display_name" text NOT NULL,
	"title" text NOT NULL,
	"tldr" text NOT NULL,
	"body_markdown" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"rejection_reason" text,
	"submitted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "book_summary_revisions_summary_id_book_summaries_id_fk" FOREIGN KEY ("summary_id") REFERENCES "public"."book_summaries"("id") ON DELETE cascade ON UPDATE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "book_summary_revisions_summary_unique" ON "book_summary_revisions" ("summary_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "book_summary_revisions_status_idx" ON "book_summary_revisions" ("status");
--> statement-breakpoint
CREATE TRIGGER audit_book_summary_revisions AFTER INSERT OR UPDATE OR DELETE ON "book_summary_revisions" FOR EACH ROW EXECUTE FUNCTION audit_capture();
