/**
 * @jest-environment node
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

describe('0046 book slugs migration', () => {
  const migrationPath = join(process.cwd(), 'drizzle/0046_book_slugs.sql')

  it('adds a nullable unique slug to books', () => {
    expect(existsSync(migrationPath)).toBe(true)

    const sql = readFileSync(migrationPath, 'utf8')
    expect(sql).toContain('ALTER TABLE "books" ADD COLUMN IF NOT EXISTS "slug" text')
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "books_slug_unique"')
    expect(sql).toContain('ON "books" ("slug")')
  })
})
