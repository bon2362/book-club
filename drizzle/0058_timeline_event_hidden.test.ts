/**
 * @jest-environment node
 */
import fs from 'node:fs'
import path from 'node:path'

describe('0058_timeline_event_hidden.sql', () => {
  const sql = fs.readFileSync(path.join(process.cwd(), 'drizzle/0058_timeline_event_hidden.sql'), 'utf8')

  it('adds a positive visible flag to timeline event memberships', () => {
    expect(sql).toMatch(/alter table\s+"?timeline_events"?/i)
    expect(sql).toMatch(/add column\s+"visible"\s+boolean\s+default true\s+not null/i)
    expect(sql).not.toMatch(/add column\s+"hidden"/i)
  })
})
