/**
 * @jest-environment node
 */
import { readFileSync } from 'fs'
import { join } from 'path'

describe('0039 audit_log migration', () => {
  const sql = readFileSync(join(process.cwd(), 'drizzle/0039_audit_log.sql'), 'utf8')

  it('creates the audit_log table with required columns', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "audit_log"')
    expect(sql).toContain('"occurred_at" timestamp DEFAULT now() NOT NULL')
    expect(sql).toContain('"actor_user_id" text')
    expect(sql).toContain('"source" text NOT NULL')
    expect(sql).toContain('"action" text NOT NULL')
    expect(sql).toContain('"entity_type" text NOT NULL')
    expect(sql).toContain('"before" jsonb')
    expect(sql).toContain('"after" jsonb')
  })

  it('does NOT add a FK on actor_user_id (append-only journal, no cascade)', () => {
    expect(sql).not.toMatch(/actor_user_id[^,]*REFERENCES/i)
  })

  it('adds read indexes', () => {
    expect(sql).toContain('"audit_log_entity_idx"')
    expect(sql).toContain('"audit_log_actor_idx"')
    expect(sql).toContain('"audit_log_occurred_at_idx"')
  })
})
