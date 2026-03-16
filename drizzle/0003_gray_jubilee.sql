CREATE TABLE "book_new_flags" (
	"book_id" text PRIMARY KEY NOT NULL,
	"is_new" boolean NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "languages" text;