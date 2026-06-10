/**
 * @jest-environment node
 */
import { readFileSync } from 'fs'
import { join } from 'path'

describe('0041 audit reduce noise migration', () => {
  const sql = readFileSync(join(process.cwd(), 'drizzle/0041_audit_reduce_noise.sql'), 'utf8')

  it('drops the audit trigger for user_activity_events', () => {
    expect(sql).toContain('DROP TRIGGER IF EXISTS "audit_user_activity_events"')
  })

  it('redefines audit_capture function with CREATE OR REPLACE', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION audit_capture()')
  })

  it('contains the skip block for last_activity_at telemetry updates', () => {
    expect(sql).toContain("v_changed <@ '[\"last_activity_at\"]'::jsonb")
  })

  it('contains the skip block for last_seen_at telemetry updates', () => {
    expect(sql).toContain("v_changed <@ '[\"last_seen_at\"]'::jsonb")
  })

  it('skip blocks are inside UPDATE + v_changed guard', () => {
    expect(sql).toContain("IF TG_OP = 'UPDATE' AND v_changed IS NOT NULL THEN")
  })

  it('still includes core function parts (masking, entity_id, insert)', () => {
    expect(sql).toContain("current_setting('app.audit_actor', true)")
    expect(sql).toContain("COALESCE(NULLIF(current_setting('app.audit_source', true), ''), 'trigger')")
    expect(sql).toContain("INSERT INTO audit_log")
    expect(sql).toContain("v_before := v_before - 'token'")
    expect(sql).toContain("concat_ws(':'")
  })
})
