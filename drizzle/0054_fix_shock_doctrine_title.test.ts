/**
 * @jest-environment node
 */
import { readFileSync } from 'fs'
import { join } from 'path'

describe('0054 fix Shock Doctrine title migration', () => {
  const sql = readFileSync(join(process.cwd(), 'drizzle/0054_fix_shock_doctrine_title.sql'), 'utf8')

  it('relies on the migration runner transaction and clears audit identity', () => {
    expect(sql).not.toContain('BEGIN;')
    expect(sql).not.toContain('COMMIT;')
    expect(sql).toContain("SET LOCAL app.audit_source = 'system'")
    expect(sql).toContain("SET LOCAL app.audit_actor = ''")
    expect(sql).toContain("SET LOCAL app.audit_label = ''")
  })

  it('only corrects the known imported typo on the canonical book', () => {
    expect(sql).toContain("\"id\" = '9b351ca1-6513-43be-80d1-1547eb900984'")
    expect(sql).toContain("\"title\" = 'Доктирна шока'")
    expect(sql).toContain("\"title\" = 'Доктрина шока'")
    expect(sql).toContain('"updated_at" = now()')
  })

  it('fails instead of silently accepting a missing or unexpected catalog row', () => {
    expect(sql).toContain('IF NOT EXISTS')
    expect(sql).toContain("RAISE EXCEPTION 'Shock Doctrine catalog title correction postcondition failed'")
  })
})
