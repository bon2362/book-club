/**
 * @jest-environment node
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { AUDITED_TABLES } from '../lib/audit/audited-tables'

describe('0056 timeline tables migration', () => {
  const sql = readFileSync(join(process.cwd(), 'drizzle/0056_timeline_tables.sql'), 'utf8')

  const tables = [
    'historical_event_types',
    'historical_events',
    'historical_epochs',
    'timelines',
    'timeline_events',
    'timeline_epochs',
  ]

  it.each(tables)('creates the %s table', (table) => {
    expect(sql).toContain(`CREATE TABLE "${table}"`)
  })

  it.each(tables)('registers %s in the audit registry', (table) => {
    expect(AUDITED_TABLES).toContain(table)
  })

  it('keeps the slug unique and shaped like a URL segment', () => {
    expect(sql).toContain('CREATE UNIQUE INDEX "timelines_slug_unique"')
    expect(sql).toContain('timelines_slug_format_check')
  })

  it('forbids an ongoing event that also has an end year', () => {
    expect(sql).toContain('CHECK (NOT ("ongoing" AND "end_year" IS NOT NULL))')
  })

  it('cascades membership rows when a timeline is deleted', () => {
    expect(sql).toContain('REFERENCES "timelines"("id") ON DELETE CASCADE')
  })

  it('keeps an event type in use from being deleted', () => {
    expect(sql).toContain('REFERENCES "historical_event_types"("id") ON DELETE RESTRICT')
  })
})
