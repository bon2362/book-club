/**
 * @jest-environment node
 */
import { readFileSync } from 'fs'
import { join } from 'path'

describe('0037 matching session state_version migration', () => {
  const sql = readFileSync(
    join(process.cwd(), 'drizzle/0037_matching_session_state_version.sql'),
    'utf8',
  )

  it('adds a non-null state_version counter defaulting to 0', () => {
    expect(sql).toContain('ALTER TABLE "matching_sessions"')
    expect(sql).toContain('"state_version" integer')
    expect(sql).toContain('DEFAULT 0')
    expect(sql).toContain('NOT NULL')
  })
})
