CREATE TABLE "signup_books" (
	"user_id" text NOT NULL,
	"book_name" text NOT NULL,
	"signed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "signup_books_user_id_book_name_pk" PRIMARY KEY("user_id","book_name")
);
--> statement-breakpoint
ALTER TABLE "signup_books" ADD CONSTRAINT "signup_books_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;