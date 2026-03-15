CREATE TABLE "book_new_flags" (
	"book_id" text PRIMARY KEY NOT NULL,
	"is_new" boolean NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
