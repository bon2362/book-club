-- Привязка темы форума Telegram к календарю круга (пилот календаря в теме).
-- Одна тема (chat_id + message_thread_id) ведёт ровно к одному календарю;
-- один календарь может быть привязан к нескольким темам (тестовая и рабочая группа).
-- Голоса здесь не хранятся: источник правды — user_availability.
CREATE TABLE IF NOT EXISTS "telegram_calendar_topics" (
  "id" text PRIMARY KEY,
  "schedule_id" text NOT NULL REFERENCES "circle_schedules"("id") ON DELETE CASCADE,
  "chat_id" text NOT NULL,
  "message_thread_id" integer NOT NULL,
  "announcement_message_id" integer,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "telegram_calendar_topics_chat_thread_uniq" ON "telegram_calendar_topics" ("chat_id", "message_thread_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "telegram_calendar_topics_schedule_idx" ON "telegram_calendar_topics" ("schedule_id");
--> statement-breakpoint
CREATE TRIGGER audit_telegram_calendar_topics AFTER INSERT OR UPDATE OR DELETE ON "telegram_calendar_topics" FOR EACH ROW EXECUTE FUNCTION audit_capture();
