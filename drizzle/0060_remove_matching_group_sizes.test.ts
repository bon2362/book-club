/**
 * @jest-environment node
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { AUDITED_TABLES } from '../lib/audit/audited-tables'

describe('0060 fixed matching group sizes migration', () => {
  const sql = readFileSync(join(process.cwd(), 'drizzle/0060_remove_matching_group_sizes.sql'), 'utf8')

  it('removes the obsolete range constraint before dropping both columns', () => {
    const constraint = sql.indexOf('DROP CONSTRAINT IF EXISTS "matching_sessions_group_size_range_check"')
    const minColumn = sql.indexOf('DROP COLUMN IF EXISTS "min_group_size"')
    const maxColumn = sql.indexOf('DROP COLUMN IF EXISTS "max_group_size"')

    expect(constraint).toBeGreaterThanOrEqual(0)
    expect(minColumn).toBeGreaterThan(constraint)
    expect(maxColumn).toBeGreaterThan(minColumn)
  })

  it('keeps matching_sessions in the audit registry', () => {
    expect(AUDITED_TABLES).toContain('matching_sessions')
    expect(sql).not.toMatch(/DROP (TRIGGER|FUNCTION)/)
  })
})
