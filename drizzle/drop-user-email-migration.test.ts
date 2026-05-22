/**
 * @jest-environment node
 */
import { readFileSync } from 'fs'
import { join } from 'path'

describe('0019 drop user.email migration', () => {
  const sql = readFileSync(join(process.cwd(), 'drizzle/0019_drop_user_email.sql'), 'utf8')

  it('backfills an email identity for contact-email users without any identity', () => {
    expect(sql).toContain('INSERT INTO "user_identities"')
    expect(sql).toContain('lower(trim(u."contact_email"))')
    expect(sql).toContain('WHERE u."contact_email" IS NOT NULL')
    expect(sql).toContain('WHERE ui."user_id" = u."id"')
  })

  it('does not overwrite existing identity ownership', () => {
    expect(sql).toContain('ON CONFLICT ("provider", "provider_account_id") DO NOTHING')
  })

  it('drops only expired verification tokens before dropping user.email', () => {
    expect(sql).toContain('DELETE FROM "verificationToken"')
    expect(sql).toContain('WHERE "expires" < now()')
    expect(sql).toContain('ALTER TABLE "user" DROP COLUMN IF EXISTS "email"')
  })
})
