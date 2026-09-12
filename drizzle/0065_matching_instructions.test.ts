/** @jest-environment node */

import { readFileSync } from 'fs'
import { join } from 'path'

describe('0065 matching instructions migration', () => {
  const sql = readFileSync(join(process.cwd(), 'drizzle/0065_matching_instructions.sql'), 'utf8')

  it('creates one seeded global Markdown instruction with an audit trigger', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "matching_instructions"')
    expect(sql).toContain("'global'")
    expect(sql).toContain('"body_markdown" text NOT NULL')
    expect(sql).toContain('ON "matching_instructions"')
  })
})
