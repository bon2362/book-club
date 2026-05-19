/**
 * @jest-environment node
 */
import { readFileSync } from 'fs'
import { join } from 'path'

describe('0012 user activity events migration', () => {
  const sql = readFileSync(join(process.cwd(), 'drizzle/0012_user_activity_events.sql'), 'utf8')

  it('backfills activity events from existing Release A sources with stable dedupe keys', () => {
    expect(sql).toContain('FROM "user" u')
    expect(sql).toContain('FROM "signup_books" sb')
    expect(sql).toContain('FROM "book_priorities" bp')
    expect(sql).toContain('FROM "book_submissions" bs')
    expect(sql).toContain('FROM "feedback" f')
    expect(sql.match(/ON CONFLICT \("dedupe_key"\) DO NOTHING/g)).toHaveLength(5)
  })

  it('recomputes users.last_activity_at from max event occurred_at without rollback', () => {
    expect(sql).toContain('max("occurred_at") AS "occurred_at"')
    expect(sql).toContain('WHEN u."last_activity_at" IS NULL OR u."last_activity_at" < latest_activity."occurred_at"')
    expect(sql).toContain('ELSE u."last_activity_at"')
  })
})
