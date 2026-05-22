/**
 * @jest-environment node
 */
import { readFileSync } from 'fs'
import { join } from 'path'

describe('0014 google accounts user identities backfill migration', () => {
  const sql = readFileSync(join(process.cwd(), 'drizzle/0014_google_accounts_user_identities_backfill.sql'), 'utf8')
  const [, googleBackfillStatement] = sql.split('--> statement-breakpoint')

  it('backfills only google accounts into user_identities with stable ids and user email', () => {
    expect(sql).toContain('Google account/user_identities ownership conflict detected')
    expect(googleBackfillStatement).toContain('FROM "account" a')
    expect(googleBackfillStatement).toContain('INNER JOIN "user" u ON u."id" = a."userId"')
    expect(googleBackfillStatement).toContain('WHERE a."provider" = \'google\'')
    expect(googleBackfillStatement).toContain('concat(\'backfill:account:google:\', md5(a."providerAccountId"))')
    expect(googleBackfillStatement).toContain('u."email"')
    expect(googleBackfillStatement).toContain('COALESCE(u."last_activity_at", u."created_at", now())')
    expect(googleBackfillStatement).not.toContain('last_sign_in_at')
  })

  it('backfills legacy email auth providers before auth display columns are retired', () => {
    expect(sql).toContain('concat(\'backfill:user:email:\', md5(lower(u."email")))')
    expect(sql).toContain('u."auth_provider" = \'email\'')
    expect(sql).toContain('COALESCE(u."last_sign_in_at", u."last_activity_at", u."created_at", now())')
  })

  it('is idempotent across repeat runs and does not move last_seen_at backwards', () => {
    expect(sql).toContain('ON CONFLICT ("provider", "provider_account_id") DO UPDATE')
    expect(sql).not.toContain('"user_id" = EXCLUDED."user_id",')
    expect(sql).toContain('"last_seen_at" = GREATEST("user_identities"."last_seen_at", EXCLUDED."last_seen_at")')
    expect(sql).toContain('WHERE "user_identities"."user_id" = EXCLUDED."user_id"')
  })
})

describe('0015 profile-only activity backfill migration', () => {
  const sql = readFileSync(join(process.cwd(), 'drizzle/0015_profile_only_activity_backfill.sql'), 'utf8')

  it('creates profile_submitted events only for profile-only users with missing activity', () => {
    expect(sql).toContain('FROM "user" u')
    expect(sql).toContain('u."last_activity_at" IS NULL')
    expect(sql).toContain('NULLIF(BTRIM(u."name"), \'\') IS NOT NULL')
    expect(sql).toContain('NULLIF(BTRIM(u."contacts"), \'\') IS NOT NULL')
    expect(sql).toContain('\'profile_submitted\'')
    expect(sql).toContain('COALESCE(u."emailVerified", u."created_at", now())')
    expect(sql).toContain('concat(\'backfill:user:profile_only:\', u."id")')
  })

  it('is idempotent and recomputes users.last_activity_at from max events without rollback', () => {
    expect(sql).toContain('ON CONFLICT ("dedupe_key") DO NOTHING')
    expect(sql).toContain('max("occurred_at") AS "occurred_at"')
    expect(sql).toContain('WHEN u."last_activity_at" IS NULL OR u."last_activity_at" < latest_activity."occurred_at"')
    expect(sql).toContain('ELSE u."last_activity_at"')
    expect(sql).toContain('AND u."last_activity_at" IS NULL')
  })
})
