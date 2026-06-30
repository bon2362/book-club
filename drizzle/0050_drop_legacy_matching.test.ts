/**
 * @jest-environment node
 */
import { readFileSync } from 'fs'
import { join } from 'path'

describe('0050 legacy matching schema cleanup', () => {
  const sql = readFileSync(join(process.cwd(), 'drizzle/0050_drop_legacy_matching.sql'), 'utf8')
  const schema = readFileSync(join(process.cwd(), 'lib/db/schema.ts'), 'utf8')
  const auditedTables = readFileSync(join(process.cwd(), 'lib/audit/audited-tables.ts'), 'utf8')

  it('drops the two legacy matching tables', () => {
    expect(sql).toContain('DROP TABLE IF EXISTS "matching_pseudonym_reservations"')
    expect(sql).toContain('DROP TABLE IF EXISTS "matching_preference_events"')
    expect(schema).not.toContain("pgTable('matching_pseudonym_reservations'")
    expect(schema).not.toContain("pgTable('matching_preference_events'")
    expect(auditedTables).not.toContain("'matching_pseudonym_reservations'")
    expect(auditedTables).not.toContain("'matching_preference_events'")
  })

  it.each([
    'optimization_mode',
    'metric_groups_count',
    'metric_coverage',
    'metric_time_to_freeze_seconds',
    'metric_time_since_last_mutation_seconds',
    'metric_top3_hit_rate',
  ])('drops matching_sessions.%s', (column) => {
    expect(sql).toContain(`DROP COLUMN IF EXISTS "${column}"`)
    expect(schema).not.toContain(`'${column}'`)
  })

  it('drops the participant pseudonym column while keeping frozen snapshots', () => {
    expect(sql).toContain('ALTER TABLE "matching_session_participants" DROP COLUMN IF EXISTS "pseudonym"')
    expect(schema).not.toContain("pseudonym: text('pseudonym')")
    expect(schema).toContain("frozenAt:")
    expect(schema).toContain("frozenScenarioJson:")
  })
})
