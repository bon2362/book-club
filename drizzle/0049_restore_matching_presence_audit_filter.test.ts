/**
 * @jest-environment node
 */
import { readFileSync } from 'fs'
import { join } from 'path'

describe('0049 matching presence audit filter migration', () => {
  const sql = readFileSync(
    join(process.cwd(), 'drizzle/0049_restore_matching_presence_audit_filter.sql'),
    'utf8',
  )

  it('replaces the shared audit capture function without changing triggers', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION audit_capture() RETURNS trigger')
    expect(sql).not.toContain('CREATE TRIGGER')
    expect(sql).not.toContain('DROP TRIGGER')
  })

  it('keeps every telemetry-only update out of the audit log', () => {
    expect(sql).toContain("TG_TABLE_NAME = 'user' AND v_changed <@ '[\"last_activity_at\"]'::jsonb")
    expect(sql).toContain("TG_TABLE_NAME = 'user_identities' AND v_changed <@ '[\"last_seen_at\"]'::jsonb")
    expect(sql).toContain("TG_TABLE_NAME = 'matching_session_participants' AND v_changed <@ '[\"last_seen_at\"]'::jsonb")
  })

  it('preserves every current sensitive-field mask', () => {
    expect(sql).toContain("v_before := v_before - 'token'; v_after := v_after - 'token';")
    expect(sql).toContain("v_before := v_before - 'token_hash'; v_after := v_after - 'token_hash';")
    expect(sql).toContain("v_before := v_before - 'visitor_hash'; v_after := v_after - 'visitor_hash';")
  })
})
