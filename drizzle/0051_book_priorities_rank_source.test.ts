/**
 * @jest-environment node
 */
import { readFileSync } from 'fs'
import { join } from 'path'

describe('0051 book_priorities rank_source migration', () => {
  const sql = readFileSync(join(process.cwd(), 'drizzle/0051_book_priorities_rank_source.sql'), 'utf8')

  it('adds the rank_source column with an auto default', () => {
    expect(sql).toMatch(/ALTER TABLE "book_priorities" ADD COLUMN IF NOT EXISTS "rank_source" text NOT NULL DEFAULT 'auto'/)
  })
})
