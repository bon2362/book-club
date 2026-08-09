/**
 * @jest-environment node
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { AUDITED_TABLES } from '../lib/audit/audited-tables'

const sqlText = readFileSync(join(process.cwd(), 'drizzle/0062_calendar.sql'), 'utf8')

describe('0062 calendar migration', () => {
  it('adds timezone and confirmation flag to users', () => {
    expect(sqlText).toContain('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "timezone" text')
    expect(sqlText).toContain('ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "timezone_confirmed" boolean NOT NULL DEFAULT false')
  })

  it('creates the three calendar tables', () => {
    expect(sqlText).toContain('CREATE TABLE IF NOT EXISTS "user_availability"')
    expect(sqlText).toContain('CREATE TABLE IF NOT EXISTS "circle_schedules"')
    expect(sqlText).toContain('CREATE TABLE IF NOT EXISTS "circle_meetings"')
  })

  it('attaches audit_capture to every new mutable table', () => {
    for (const table of ['user_availability', 'circle_schedules', 'circle_meetings']) {
      expect(AUDITED_TABLES).toContain(table)
      expect(sqlText).toContain(`CREATE TRIGGER audit_${table} AFTER INSERT OR UPDATE OR DELETE ON "${table}" FOR EACH ROW EXECUTE FUNCTION audit_capture();`)
    }
  })

  it('rejects unaligned and empty availability intervals', () => {
    expect(sqlText).toContain('user_availability_aligned_check')
    expect(sqlText).toContain('user_availability_order_check')
  })

  it('makes schedule addresses unique', () => {
    expect(sqlText).toContain('circle_schedules_slug_uniq')
    expect(sqlText).toContain('circle_schedules_session_book_position_uniq')
  })
})
