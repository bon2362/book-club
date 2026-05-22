/**
 * @jest-environment node
 */
import { readFileSync } from 'fs'
import { join } from 'path'

describe('0017 user_created activity backfill migration', () => {
  const sql = readFileSync(join(process.cwd(), 'drizzle/0017_user_created_activity_backfill.sql'), 'utf8')

  it('creates one user_created event per existing user from created_at with stable dedupe keys', () => {
    expect(sql).toContain('FROM "user" u')
    expect(sql).toContain('\'user_created\'')
    expect(sql).toContain('u."created_at"')
    expect(sql).toContain('concat(\'backfill:user_created:\', u."id")')
    expect(sql).toContain('ON CONFLICT ("dedupe_key") DO NOTHING')
  })

  it('updates last_activity_at only when the backfilled event is newer or the cache is missing', () => {
    expect(sql).toContain('max("occurred_at") AS "occurred_at"')
    expect(sql).toContain('WHEN u."last_activity_at" IS NULL OR u."last_activity_at" < latest_activity."occurred_at"')
    expect(sql).toContain('ELSE u."last_activity_at"')
    expect(sql).toContain('u."last_activity_at" IS NULL')
    expect(sql).toContain('OR u."last_activity_at" < latest_activity."occurred_at"')
  })
})
