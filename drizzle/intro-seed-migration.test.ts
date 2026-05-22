/**
 * @jest-environment node
 */
import { readFileSync } from 'fs'
import { join } from 'path'

describe('0016 seed intro sections migration', () => {
  const sql = readFileSync(join(process.cwd(), 'drizzle/0016_seed_intro_sections.sql'), 'utf8')

  it('seeds defaults only when intro_sections is empty', () => {
    expect(sql).toContain('IF NOT EXISTS (SELECT 1 FROM "intro_sections" LIMIT 1) THEN')
    expect(sql).toContain('INSERT INTO "intro_sections"')
    expect(sql).toContain('END IF;')
  })

  it('inserts one header and the default intro sections with stable ids', () => {
    expect(sql).toContain("'intro-header'")
    expect(sql).toContain("'header'")
    expect(sql).toContain("'intro-section-1'")
    expect(sql).toContain("'intro-section-4'")
    expect(sql).toContain("'Как это устроено?'")
    expect(sql).toContain("'Чем это не является?'")
  })
})
