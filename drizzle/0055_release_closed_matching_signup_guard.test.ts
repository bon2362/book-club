/**
 * @jest-environment node
 */
import { readFileSync } from 'fs'
import { join } from 'path'

describe('0055 release closed matching signup guard migration', () => {
  const sql = readFileSync(
    join(process.cwd(), 'drizzle/0055_release_closed_matching_signup_guard.sql'),
    'utf8',
  )

  it('keeps the signup guard only for mutable matching lifecycles', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION guard_current_matching_signup_binding()')
    expect(sql).toContain('WHERE "status" IN (\'active\', \'open\')')
    expect(sql).not.toMatch(/WHERE "status" IN \([^)]*'closed'/)
    expect(sql).not.toMatch(/WHERE "status" IN \([^)]*'frozen'/)
  })

  it('still protects hard intents and assignments in a current session', () => {
    expect(sql).toContain('FROM "matching_book_intents"')
    expect(sql).toContain('AND "kind" = \'hard\'')
    expect(sql).toContain('FROM "matching_book_assignments"')
    expect(sql).toContain("USING ERRCODE = '23514'")
  })

  it('does not recreate or remove the existing trigger', () => {
    expect(sql).not.toContain('DROP TRIGGER')
    expect(sql).not.toContain('CREATE TRIGGER')
  })
})
