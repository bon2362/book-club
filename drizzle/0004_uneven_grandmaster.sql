CREATE TABLE "book_priorities" (
	"user_id" text NOT NULL,
	"book_name" text NOT NULL,
	"rank" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "book_priorities_user_id_book_name_pk" PRIMARY KEY("user_id","book_name")
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "priorities_set" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "book_priorities" ADD CONSTRAINT "book_priorities_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;