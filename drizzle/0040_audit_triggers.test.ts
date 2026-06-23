/**
 * @jest-environment node
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { AUDITED_TABLES } from '../lib/audit/audited-tables'

describe('0040 audit triggers migration', () => {
  const sql = readFileSync(join(process.cwd(), 'drizzle/0040_audit_triggers.sql'), 'utf8')
  const allSql = [
    '0040_audit_triggers.sql',
    '0043_user_merge_events.sql',
    '0044_book_summaries.sql',
  ].map(file => readFileSync(join(process.cwd(), 'drizzle', file), 'utf8')).join('\n')

  it('defines the audit_capture function reading app.audit_* settings', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION audit_capture()')
    expect(sql).toContain("current_setting('app.audit_actor', true)")
    expect(sql).toContain("COALESCE(NULLIF(current_setting('app.audit_source', true), ''), 'trigger')")
    expect(sql).toContain('TG_TABLE_NAME')
  })

  it('attaches a trigger to every audited table (registry stays in sync)', () => {
    for (const table of AUDITED_TABLES) {
      expect(allSql).toContain(`ON "${table}" FOR EACH ROW EXECUTE FUNCTION audit_capture()`)
    }
  })

  it('does not attach a trigger to audit_log itself (no recursion)', () => {
    expect(sql).not.toContain('ON "audit_log"')
  })

  it('masks secret columns before storing', () => {
    expect(sql).toContain("v_before := v_before - 'token'")
    expect(sql).toContain("v_before := v_before - 'token_hash'")
  })

  it('builds a composite entity_id for tables without an id column', () => {
    expect(sql).toContain("concat_ws(':'")
  })
})
