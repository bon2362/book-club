CREATE TABLE IF NOT EXISTS "matching_instructions" (
  "id" text PRIMARY KEY,
  "title" text NOT NULL,
  "lead" text NOT NULL,
  "expand_label" text NOT NULL,
  "collapse_label" text NOT NULL,
  "body_markdown" text NOT NULL,
  "updated_at" timestamp NOT NULL DEFAULT now()
);
--> statement-breakpoint
INSERT INTO "matching_instructions" ("id", "title", "lead", "expand_label", "collapse_label", "body_markdown")
VALUES (
  'global',
  'Совпадения по вашим книгам',
  'Выбирайте все книги, которые будете читать',
  'Подробнее',
  'Короче',
  E'- Выберите все книги, которые будете читать\n- Книги отсортированы по степени интереса участни:ц, добавивших их в свои списки\n- Нажмите на имя участни:цы, чтобы узнать, на какое место он:а поместила книгу\n- В меню кнопки «Записаться ▾» можно включить авто-запись сразу на нескольких книгах — она действует, пока вы не запишетесь окончательно; книга сформируется при 2 окончательных записях и 3 участниках всего; круги — по 3–5 человек\n- Можно читать несколько книг одновременно\n- Разные группы могут читать одну и ту же книгу'
)
ON CONFLICT ("id") DO NOTHING;
--> statement-breakpoint
CREATE TRIGGER audit_matching_instructions AFTER INSERT OR UPDATE OR DELETE ON "matching_instructions" FOR EACH ROW EXECUTE FUNCTION audit_capture();
