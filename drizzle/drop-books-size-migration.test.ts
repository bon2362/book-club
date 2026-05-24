/**
 * @jest-environment node
 */
import { readFileSync } from 'fs'
import { join } from 'path'

describe('0027 books catalog cleanup migration', () => {
  const sql = readFileSync(join(process.cwd(), 'drizzle/0027_books_catalog_cleanup.sql'), 'utf8')

  it('drops the size column', () => {
    expect(sql).toContain('DROP COLUMN IF EXISTS "size"')
  })

  it('restores created_at from earlier catalog signals when available', () => {
    expect(sql).toContain('WITH first_signals AS')
    expect(sql).toContain('LEFT JOIN "signup_books"')
    expect(sql).toContain('LEFT JOIN "book_priorities"')
    expect(sql).toContain('LEFT JOIN "book_submissions"')
    expect(sql).toContain('SET "created_at" = first_signals.inferred_created_at')
  })

  it('normalizes sheets_import source to admin before tightening the constraint', () => {
    expect(sql).toContain('UPDATE "books"')
    expect(sql).toContain('SET "source" = \'admin\'')
    expect(sql).toContain('WHERE "source" = \'sheets_import\'')
    expect(sql).toContain("CHECK (\"source\" IN ('admin','submission'))")
  })

  it('drops archived_at because visibility is the only catalog visibility state', () => {
    expect(sql).toContain('DROP COLUMN IF EXISTS "archived_at"')
  })

  it('uses IF EXISTS so the migration is safe to re-run', () => {
    expect(sql).toMatch(/DROP COLUMN IF EXISTS/)
  })
})
