CREATE TABLE "historical_event_types" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"color" text NOT NULL,
	"icon" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "historical_event_types_title_lower_idx" ON "historical_event_types" (lower("title"));
--> statement-breakpoint
CREATE TABLE "historical_events" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"event_type_id" text NOT NULL,
	"start_year" integer NOT NULL,
	"start_era" text NOT NULL,
	"start_month" integer,
	"start_day" integer,
	"end_year" integer,
	"end_era" text,
	"end_month" integer,
	"end_day" integer,
	"ongoing" boolean DEFAULT false NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"image_url" text,
	"image_caption" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "historical_events_event_type_id_fk" FOREIGN KEY ("event_type_id") REFERENCES "historical_event_types"("id") ON DELETE RESTRICT,
	CONSTRAINT "historical_events_start_year_check" CHECK ("start_year" > 0),
	CONSTRAINT "historical_events_start_era_check" CHECK ("start_era" IN ('BCE', 'CE')),
	CONSTRAINT "historical_events_start_month_check" CHECK ("start_month" IS NULL OR "start_month" BETWEEN 1 AND 12),
	CONSTRAINT "historical_events_start_day_check" CHECK ("start_day" IS NULL OR ("start_month" IS NOT NULL AND "start_day" BETWEEN 1 AND 31)),
	CONSTRAINT "historical_events_end_year_check" CHECK ("end_year" IS NULL OR "end_year" > 0),
	CONSTRAINT "historical_events_end_era_check" CHECK ("end_era" IS NULL OR "end_era" IN ('BCE', 'CE')),
	CONSTRAINT "historical_events_end_month_check" CHECK ("end_month" IS NULL OR "end_month" BETWEEN 1 AND 12),
	CONSTRAINT "historical_events_end_day_check" CHECK ("end_day" IS NULL OR ("end_month" IS NOT NULL AND "end_day" BETWEEN 1 AND 31)),
	CONSTRAINT "historical_events_end_complete_check" CHECK (
		("end_year" IS NULL AND "end_era" IS NULL AND "end_month" IS NULL AND "end_day" IS NULL)
		OR ("end_year" IS NOT NULL AND "end_era" IS NOT NULL)
	),
	CONSTRAINT "historical_events_ongoing_check" CHECK (NOT ("ongoing" AND "end_year" IS NOT NULL))
);
--> statement-breakpoint
CREATE INDEX "historical_events_title_idx" ON "historical_events" ("title");
--> statement-breakpoint
CREATE INDEX "historical_events_type_idx" ON "historical_events" ("event_type_id");
--> statement-breakpoint
CREATE TABLE "historical_epochs" (
	"id" text PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"start_year" integer NOT NULL,
	"start_era" text NOT NULL,
	"start_month" integer,
	"start_day" integer,
	"end_year" integer NOT NULL,
	"end_era" text NOT NULL,
	"end_month" integer,
	"end_day" integer,
	"description" text DEFAULT '' NOT NULL,
	"image_url" text,
	"image_caption" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "historical_epochs_start_year_check" CHECK ("start_year" > 0),
	CONSTRAINT "historical_epochs_end_year_check" CHECK ("end_year" > 0),
	CONSTRAINT "historical_epochs_start_era_check" CHECK ("start_era" IN ('BCE', 'CE')),
	CONSTRAINT "historical_epochs_end_era_check" CHECK ("end_era" IN ('BCE', 'CE')),
	CONSTRAINT "historical_epochs_start_month_check" CHECK ("start_month" IS NULL OR "start_month" BETWEEN 1 AND 12),
	CONSTRAINT "historical_epochs_start_day_check" CHECK ("start_day" IS NULL OR ("start_month" IS NOT NULL AND "start_day" BETWEEN 1 AND 31)),
	CONSTRAINT "historical_epochs_end_month_check" CHECK ("end_month" IS NULL OR "end_month" BETWEEN 1 AND 12),
	CONSTRAINT "historical_epochs_end_day_check" CHECK ("end_day" IS NULL OR ("end_month" IS NOT NULL AND "end_day" BETWEEN 1 AND 31))
);
--> statement-breakpoint
CREATE INDEX "historical_epochs_title_idx" ON "historical_epochs" ("title");
--> statement-breakpoint
CREATE TABLE "timelines" (
	"id" text PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"viewport_start" double precision,
	"viewport_end" double precision,
	"filter_type_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"epochs_visible" boolean DEFAULT true NOT NULL,
	"show_all" boolean DEFAULT false NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "timelines_slug_format_check" CHECK ("slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "timelines_slug_unique" ON "timelines" ("slug");
--> statement-breakpoint
CREATE INDEX "timelines_published_idx" ON "timelines" ("published");
--> statement-breakpoint
CREATE TABLE "timeline_events" (
	"timeline_id" text NOT NULL,
	"event_id" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "timeline_events_pk" PRIMARY KEY ("timeline_id", "event_id"),
	CONSTRAINT "timeline_events_timeline_id_fk" FOREIGN KEY ("timeline_id") REFERENCES "timelines"("id") ON DELETE CASCADE,
	CONSTRAINT "timeline_events_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "historical_events"("id") ON DELETE CASCADE
);
--> statement-breakpoint
CREATE INDEX "timeline_events_event_idx" ON "timeline_events" ("event_id");
--> statement-breakpoint
CREATE TABLE "timeline_epochs" (
	"timeline_id" text NOT NULL,
	"epoch_id" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"color" text NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"pinned_lane" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "timeline_epochs_pk" PRIMARY KEY ("timeline_id", "epoch_id"),
	CONSTRAINT "timeline_epochs_timeline_id_fk" FOREIGN KEY ("timeline_id") REFERENCES "timelines"("id") ON DELETE CASCADE,
	CONSTRAINT "timeline_epochs_epoch_id_fk" FOREIGN KEY ("epoch_id") REFERENCES "historical_epochs"("id") ON DELETE CASCADE,
	CONSTRAINT "timeline_epochs_pinned_lane_check" CHECK ("pinned_lane" IS NULL OR "pinned_lane" >= 0)
);
--> statement-breakpoint
CREATE INDEX "timeline_epochs_epoch_idx" ON "timeline_epochs" ("epoch_id");
--> statement-breakpoint
CREATE TRIGGER audit_historical_event_types AFTER INSERT OR UPDATE OR DELETE ON "historical_event_types" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_historical_events AFTER INSERT OR UPDATE OR DELETE ON "historical_events" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_historical_epochs AFTER INSERT OR UPDATE OR DELETE ON "historical_epochs" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_timelines AFTER INSERT OR UPDATE OR DELETE ON "timelines" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_timeline_events AFTER INSERT OR UPDATE OR DELETE ON "timeline_events" FOR EACH ROW EXECUTE FUNCTION audit_capture();
--> statement-breakpoint
CREATE TRIGGER audit_timeline_epochs AFTER INSERT OR UPDATE OR DELETE ON "timeline_epochs" FOR EACH ROW EXECUTE FUNCTION audit_capture();
