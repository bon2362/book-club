/**
 * @jest-environment node
 */
import { readFileSync } from 'fs'
import { join } from 'path'

describe('0020 drop users auth cache migration', () => {
  const sql = readFileSync(join(process.cwd(), 'drizzle/0020_drop_user_auth_cache.sql'), 'utf8')

  it('preserves Telegram display contact before dropping users.telegram_username', () => {
    expect(sql).toContain('UPDATE "user" u')
    expect(sql).toContain('"contacts" = \'@\' || COALESCE(ui."telegram_username", u."telegram_username")')
    expect(sql).toContain('NULLIF(trim(COALESCE(u."contacts", \'\')), \'\') IS NULL')
  })

  it('backfills identity Telegram username from legacy user cache before drop', () => {
    expect(sql).toContain('UPDATE "user_identities" ui')
    expect(sql).toContain('SET "telegram_username" = u."telegram_username"')
    expect(sql).toContain('ui."provider" = \'telegram\'')
  })

  it('drops legacy users auth cache columns', () => {
    expect(sql).toContain('ALTER TABLE "user" DROP COLUMN IF EXISTS "telegram_username"')
    expect(sql).toContain('ALTER TABLE "user" DROP COLUMN IF EXISTS "auth_provider"')
    expect(sql).toContain('ALTER TABLE "user" DROP COLUMN IF EXISTS "last_sign_in_at"')
  })
})
