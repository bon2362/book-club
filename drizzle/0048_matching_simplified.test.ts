/**
 * @jest-environment node
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'

describe('0048 matching simplified migration', () => {
  const migrationPath = join(process.cwd(), 'drizzle/0048_matching_simplified.sql')
  const sql = existsSync(migrationPath) ? readFileSync(migrationPath, 'utf8') : ''

  it('adds stable public identity and join source to session participants', () => {
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "public_ref" text')
    expect(sql).toContain('ADD COLUMN IF NOT EXISTS "join_source" text DEFAULT \'self\' NOT NULL')
    expect(sql).toContain('ALTER COLUMN "pseudonym" DROP NOT NULL')
    expect(sql).toContain('DROP INDEX IF EXISTS "matching_session_participants_session_pseudo_idx"')
    expect(sql).toContain('matching_session_participants_session_public_ref_idx')
  })

  it.each([
    'matching_circle_confirmations',
    'matching_locked_circles',
    'matching_locked_circle_members',
    'matching_notices',
    'matching_events',
  ])('creates %s', (table) => {
    expect(sql).toContain(`CREATE TABLE IF NOT EXISTS "${table}"`)
  })

  it('enforces confirmation and active locked-circle invariants', () => {
    expect(sql).toContain('matching_circle_confirmations_session_user_pk')
    expect(sql).toContain('matching_locked_circles_active_circle_idx')
    expect(sql).toContain('WHERE "status" = \'locked\'')
    expect(sql).toContain('matching_locked_circle_members_active_user_idx')
    expect(sql).toContain('WHERE "released_at" IS NULL')
  })

  it('audits every new mutable matching table', () => {
    for (const table of [
      'matching_circle_confirmations',
      'matching_locked_circles',
      'matching_locked_circle_members',
      'matching_notices',
      'matching_events',
    ]) {
      expect(sql).toContain(`ON "${table}" FOR EACH ROW EXECUTE FUNCTION audit_capture()`)
    }
  })

  it('clears disposable matching state without touching durable user preferences', () => {
    expect(sql).toContain('DELETE FROM "matching_sessions"')
    expect(sql).not.toMatch(/(?:DELETE FROM|TRUNCATE(?: TABLE)?)\s+"?(?:user|books|signup_books|book_priorities)"?/i)
  })
})
