CREATE TABLE "notification_queue" (
	"id" text PRIMARY KEY NOT NULL,
	"user_name" text NOT NULL,
	"user_email" text NOT NULL,
	"contacts" text NOT NULL,
	"added_books" text NOT NULL,
	"is_new" boolean NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"processing_at" timestamp,
	"sent_at" timestamp
);
--> statement-breakpoint
CREATE INDEX "notification_queue_sent_at_idx" ON "notification_queue" USING btree ("sent_at");