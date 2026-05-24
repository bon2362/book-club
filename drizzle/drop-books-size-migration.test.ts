/**
 * @jest-environment node
 */
import { readFileSync } from 'fs'
import { join } from 'path'

describe('0026 drop books.size migration', () => {
  const sql = readFileSync(join(process.cwd(), 'drizzle/0026_drop_books_size.sql'), 'utf8')

  it('drops the size column', () => {
    expect(sql).toContain('ALTER TABLE "books" DROP COLUMN IF EXISTS "size"')
  })

  it('uses IF EXISTS so the migration is safe to re-run', () => {
    expect(sql).toMatch(/DROP COLUMN IF EXISTS/)
  })
})
