CREATE TABLE "intro_sections" (
	"id" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"is_published" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "intro_sections_kind_sort_idx" ON "intro_sections" USING btree ("kind","sort_order");