/**
 * @jest-environment node
 */
import { readFileSync } from 'fs'
import { join } from 'path'

describe('0044 book_summaries migration', () => {
  const sql = readFileSync(join(process.cwd(), 'drizzle/0044_book_summaries.sql'), 'utf8')

  it('создаёт таблицу book_summaries', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "book_summaries"')
  })

  it('связывает саммари с книгой и автором', () => {
    expect(sql).toContain('"book_id" text NOT NULL')
    expect(sql).toContain('"author_user_id" text NOT NULL')
    expect(sql).toContain('FOREIGN KEY ("book_id") REFERENCES "public"."books"("id") ON DELETE cascade')
    expect(sql).toContain('FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE cascade')
  })

  it('хранит markdown-содержимое и модерационный статус', () => {
    expect(sql).toContain('"display_name" text NOT NULL')
    expect(sql).toContain('"title" text DEFAULT \'\' NOT NULL')
    expect(sql).toContain('"tldr" text DEFAULT \'\' NOT NULL')
    expect(sql).toContain('"body_markdown" text DEFAULT \'\' NOT NULL')
    expect(sql).toContain('"status" text DEFAULT \'draft\' NOT NULL')
    expect(sql).toContain('"rejection_reason" text')
  })

  it('гарантирует одно саммари автора на книгу', () => {
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "book_summaries_book_author_unique"')
    expect(sql).toContain('ON "book_summaries" ("book_id","author_user_id")')
  })

  it('создаёт индексы для публичных и авторских выборок', () => {
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS "book_summaries_book_status_idx"')
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS "book_summaries_author_status_idx"')
  })

  it('навешивает audit trigger', () => {
    expect(sql).toContain('CREATE TRIGGER audit_book_summaries')
    expect(sql).toContain('ON "book_summaries" FOR EACH ROW EXECUTE FUNCTION audit_capture()')
  })
})
