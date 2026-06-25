/**
 * @jest-environment node
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

describe('0045 book summary revisions migration', () => {
  const migrationPath = join(process.cwd(), 'drizzle/0045_book_summary_revisions.sql')

  it('creates one audited revision per published summary', () => {
    expect(existsSync(migrationPath)).toBe(true)

    const sql = readFileSync(migrationPath, 'utf8')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "book_summary_revisions"')
    expect(sql).toContain('"summary_id" text NOT NULL')
    expect(sql).toContain('REFERENCES "public"."book_summaries"("id") ON DELETE cascade')
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "book_summary_revisions_summary_unique"')
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS "book_summary_revisions_status_idx"')
    expect(sql).toContain('CREATE TRIGGER audit_book_summary_revisions')
    expect(sql).toContain('ON "book_summary_revisions" FOR EACH ROW EXECUTE FUNCTION audit_capture()')
  })
})
