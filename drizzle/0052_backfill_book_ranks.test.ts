/**
 * @jest-environment node
 */
import { readFileSync } from 'fs'
import { join } from 'path'

describe('0052 backfill book ranks migration', () => {
  const sql = readFileSync(join(process.cwd(), 'drizzle/0052_backfill_book_ranks.sql'), 'utf8')

  it('runs inside a transaction tagged as a system audit source', () => {
    expect(sql).toContain('BEGIN;')
    expect(sql).toContain("SET LOCAL app.audit_source = 'system'")
    expect(sql).toContain('COMMIT;')
  })
  it('marks all pre-existing ranks as manual', () => {
    expect(sql).toMatch(/UPDATE "book_priorities" SET "rank_source" = 'manual'/)
  })
  it('appends unranked null-status signups ordered by signed_at as auto', () => {
    expect(sql).toContain('INSERT INTO "book_priorities"')
    expect(sql).toContain('personal_status" IS NULL')
    expect(sql).toContain('ROW_NUMBER() OVER')
    expect(sql).toContain('ORDER BY s."signed_at"')
    expect(sql).toContain("'auto'")
  })
})
