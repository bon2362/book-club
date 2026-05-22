/**
 * @jest-environment node
 */
import { readFileSync } from 'fs'
import { join } from 'path'

describe('0018 contact email / nullable user email migration', () => {
  const sql = readFileSync(join(process.cwd(), 'drizzle/0018_contact_email_nullable_user_email.sql'), 'utf8')

  it('adds an explicit nullable contact_email column', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "contact_email" text')
  })

  it('backfills contact_email only from real legacy emails', () => {
    expect(sql).toContain('SET "contact_email" = "email"')
    expect(sql).toContain('"email" !~* \'^telegram:[^@]+@telegram\\.user$\'')
  })

  it('drops NOT NULL before removing synthetic Telegram-only emails', () => {
    expect(sql).toContain('SET "email" = NULL')
    expect(sql).toContain('"email" ~* \'^telegram:[^@]+@telegram\\.user$\'')
    expect(sql).toContain('ALTER COLUMN "email" DROP NOT NULL')
    expect(sql.indexOf('ALTER COLUMN "email" DROP NOT NULL')).toBeLessThan(sql.indexOf('SET "email" = NULL'))
  })
})
