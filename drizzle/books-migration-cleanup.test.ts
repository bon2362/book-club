/**
 * @jest-environment node
 */
import { readFileSync } from 'fs'
import { join } from 'path'

describe('0026 drop books migration-only fields', () => {
  const sql = readFileSync(join(process.cwd(), 'drizzle/0026_drop_books_migration_fields.sql'), 'utf8')

  it('guards against approved submissions without book_id before dropping reverse links', () => {
    expect(sql).toContain('FROM "book_submissions"')
    expect(sql).toContain('"status" = \'approved\'')
    expect(sql).toContain('"book_id" IS NULL')
    expect(sql).toContain('Refusing cleanup')
  })

  it('drops migration-only books fields and mapping table', () => {
    expect(sql).toContain('DROP INDEX IF EXISTS "books_canonical_key_idx"')
    expect(sql).toContain('DROP INDEX IF EXISTS "books_source_submission_id_idx"')
    expect(sql).toContain('DROP INDEX IF EXISTS "books_source_submission_id_unique"')
    expect(sql).toContain('DROP COLUMN IF EXISTS "canonical_key"')
    expect(sql).toContain('DROP COLUMN IF EXISTS "legacy_sheets_row_id"')
    expect(sql).toContain('DROP COLUMN IF EXISTS "source_submission_id"')
    expect(sql).toContain('DROP TABLE IF EXISTS "legacy_book_mappings"')
  })
})
