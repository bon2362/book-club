/**
 * @jest-environment node
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { AUDITED_TABLES } from '../lib/audit/audited-tables'

describe('0059 matching scenario removal migration', () => {
  const sql = readFileSync(join(process.cwd(), 'drizzle/0059_remove_matching_scenarios.sql'), 'utf8')

  it('imports locked circles and aborts before cleanup unless membership matches exactly', () => {
    expect(sql).toContain('INSERT INTO "matching_circles"')
    expect(sql).toContain('INSERT INTO "matching_book_assignments"')
    expect(sql).toContain('legacy_locked_circle_id')
    expect(sql).toContain('matching_book_assignments')
    expect(sql).toContain('cannot remove matching scenarios: locked circle has no active members')
    expect(sql).toContain('cannot remove matching scenarios: locked circle member is not a session participant')
    expect(sql).toContain('cannot remove matching scenarios: imported circle membership differs')
    expect(sql.match(/NOT EXISTS \(/g)?.length).toBeGreaterThanOrEqual(5)
    expect(sql.indexOf('RAISE EXCEPTION')).toBeLessThan(sql.indexOf('DROP TABLE IF EXISTS'))
  })

  it('normalizes every deployed lifecycle value before narrowing the constraint', () => {
    expect(sql).toContain("SET \"status\" = 'open' WHERE \"status\" = 'active'")
    expect(sql).toContain("SET \"status\" = 'closed' WHERE \"status\" = 'frozen'")
    expect(sql).toContain("CHECK (\"status\" IN ('open', 'closed'))")
    expect(sql).toContain("WHERE \"status\" = 'open'")
    expect(sql.indexOf("SET \"status\" = 'open'")).toBeLessThan(sql.indexOf('ADD CONSTRAINT "matching_sessions_status_check"'))
    expect(sql.indexOf("SET \"status\" = 'closed'")).toBeLessThan(sql.indexOf('ADD CONSTRAINT "matching_sessions_status_check"'))
  })

  it('rewrites the current-session signup guard before removing the cutover marker', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION guard_current_matching_signup_binding()')
    expect(sql).toContain('WHERE "status" = \'open\'')
    expect(sql).not.toContain('SELECT "id", "book_mode_initialized_at"')
  })

  it.each([
    'matching_circle_confirmations',
    'matching_locked_circle_members',
    'matching_locked_circles',
  ])('drops legacy table %s', (table) => {
    expect(sql).toContain(`DROP TABLE IF EXISTS \"${table}\"`)
    expect(AUDITED_TABLES).not.toContain(table)
  })

  it.each([
    'legacy_locked_circle_id',
    'frozen_at',
    'frozen_scenario_json',
    'book_mode_initialized_at',
  ])('drops legacy column %s', (column) => {
    expect(sql).toContain(`DROP COLUMN IF EXISTS \"${column}\"`)
  })
})
