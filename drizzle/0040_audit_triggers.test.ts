/**
 * @jest-environment node
 */
import { readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { AUDITED_TABLES } from '../lib/audit/audited-tables'

describe('0040 audit triggers migration', () => {
  const sql = readFileSync(join(process.cwd(), 'drizzle/0040_audit_triggers.sql'), 'utf8')
  const migrationFiles = readdirSync(join(process.cwd(), 'drizzle'))
    .filter((file) => /^\d{4}_.+\.sql$/.test(file))
    .sort()
  const migrationSql = migrationFiles.map((file) => ({
    file,
    sql: readFileSync(join(process.cwd(), 'drizzle', file), 'utf8'),
  }))
  const allSql = migrationSql.map((migration) => migration.sql).join('\n')
  const currentAuditFunctionSql = migrationSql
    .filter((migration) => migration.sql.includes('CREATE OR REPLACE FUNCTION audit_capture()'))
    .at(-1)?.sql

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

  it('keeps every current mask in the latest audit_capture definition', () => {
    expect(currentAuditFunctionSql).toContain("v_before := v_before - 'token'")
    expect(currentAuditFunctionSql).toContain("v_before := v_before - 'token_hash'")
    expect(currentAuditFunctionSql).toContain("v_before := v_before - 'visitor_hash'")
  })

  it('keeps telemetry-only updates out of the latest audit_capture definition', () => {
    expect(currentAuditFunctionSql).toContain("TG_TABLE_NAME = 'user' AND v_changed <@ '[\"last_activity_at\"]'::jsonb")
    expect(currentAuditFunctionSql).toContain("TG_TABLE_NAME = 'user_identities' AND v_changed <@ '[\"last_seen_at\"]'::jsonb")
    expect(currentAuditFunctionSql).toContain("TG_TABLE_NAME = 'matching_session_participants' AND v_changed <@ '[\"last_seen_at\"]'::jsonb")
  })

  it('builds a composite entity_id for tables without an id column', () => {
    expect(sql).toContain("concat_ws(':'")
  })
})
