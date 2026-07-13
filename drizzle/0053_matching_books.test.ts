/**
 * @jest-environment node
 */
import { readFileSync } from 'fs'
import { join } from 'path'

describe('0053 matching books migration', () => {
  const sql = readFileSync(join(process.cwd(), 'drizzle/0053_matching_books.sql'), 'utf8')
  const canonicalTables = [
    'matching_book_intents',
    'matching_session_book_states',
    'matching_book_assignments',
    'matching_circles',
  ]

  it('adds the idempotent book-mode cutover marker without rewriting legacy sessions', () => {
    expect(sql).toContain('ALTER TABLE "matching_sessions" ADD COLUMN "book_mode_initialized_at" timestamp')
    expect(sql).not.toMatch(/UPDATE\s+"matching_sessions"/i)
  })

  it('keeps the single-current-session guard compatible across lifecycle values', () => {
    expect(sql).toContain('matching_sessions_status_check')
    expect(sql).toContain("CHECK (\"status\" IN ('active', 'frozen', 'open', 'closed'))")
    expect(sql).toContain('matching_sessions_book_mode_lifecycle_check')
    expect(sql).toContain(
      'CHECK ("book_mode_initialized_at" IS NULL OR "status" IN (\'open\', \'closed\'))',
    )
    expect(sql).toContain('USING btree ((true)) WHERE "status" IN (\'active\', \'open\')')
  })

  it.each(canonicalTables)('creates canonical table %s and its audit trigger', (table) => {
    expect(sql).toContain(`CREATE TABLE "${table}"`)
    expect(sql).toContain(`ON "${table}" FOR EACH ROW EXECUTE FUNCTION audit_capture()`)
  })

  it('enforces one hard intent and validates intent kinds', () => {
    expect(sql).toContain('matching_book_intents_session_user_hard_uniq')
    expect(sql).toContain('WHERE "kind" = \'hard\'')
    expect(sql).toContain('matching_book_intents_kind_check')
    expect(sql).toContain("IN ('conditional', 'hard')")
  })

  it('ties intents and assignments to real session participants', () => {
    expect(sql).toContain('matching_book_intents_session_user_fk')
    expect(sql).toContain('matching_book_assignments_session_user_fk')
    expect(sql.match(/REFERENCES "public"\."matching_session_participants"\("session_id","user_id"\)/g))
      .toHaveLength(2)
  })

  it('enforces one assignment slot and accepted assignment sources', () => {
    expect(sql).toContain('matching_book_assignments_session_user_pk')
    expect(sql).toContain('PRIMARY KEY("session_id","user_id")')
    expect(sql).toContain("IN ('hard', 'conditional', 'admin', 'legacy')")
    expect(sql).toContain(
      'matching_book_assignments_session_user_fk" FOREIGN KEY ("session_id","user_id") REFERENCES "public"."matching_session_participants"("session_id","user_id") ON DELETE no action',
    )
    expect(sql).toContain(
      'matching_book_assignments_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."matching_sessions"("id") ON DELETE cascade',
    )
  })

  it('validates formation versions and one-based circle positions', () => {
    expect(sql).toContain('matching_session_book_states_formed_state_version_check')
    expect(sql).toContain('"formed_state_version" >= 0')
    expect(sql).toContain('matching_circles_position_check')
    expect(sql).toContain('"position" >= 1')
  })

  it('prevents an assignment from referencing a circle for another book or session', () => {
    expect(sql).toContain('matching_circles_id_session_book_uniq')
    expect(sql).toContain('matching_book_assignments_circle_session_book_fk')
    expect(sql).toContain(
      'FOREIGN KEY ("circle_id","session_id","book_id") REFERENCES "public"."matching_circles"("id","session_id","book_id")',
    )
  })

  it('preserves legacy-circle provenance idempotently', () => {
    expect(sql).toContain('matching_circles_legacy_locked_circle_uniq')
    expect(sql).toContain('matching_circles_legacy_locked_circle_id_matching_locked_circles_id_fk')
  })

  it('uses restrictive book foreign keys instead of silently deleting canonical state', () => {
    const bookForeignKeys = sql.match(/REFERENCES "public"\."books"\("id"\) ON DELETE restrict/g) ?? []
    expect(bookForeignKeys).toHaveLength(4)
    expect(sql).not.toMatch(/REFERENCES "public"\."books"\("id"\) ON DELETE cascade/)
  })

  it('rejects legacy scenario writes after the atomic cutover marker is set', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION guard_initialized_matching_legacy_write()')
    for (const table of [
      'matching_circle_confirmations',
      'matching_locked_circles',
      'matching_locked_circle_members',
    ]) {
      expect(sql).toContain(`BEFORE INSERT OR UPDATE OR DELETE ON "${table}"`)
    }
    expect(sql).toContain('"book_mode_initialized_at" IS NOT NULL')
    expect(sql).toContain("current_setting('app.matching_legacy_cleanup', true) = 'on'")
    expect(sql).toContain("IF TG_OP = 'DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;")
  })

  it('protects current-session hard and assigned shortlist rows during deployment skew', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION guard_current_matching_signup_binding()')
    expect(sql).toContain(
      'BEFORE DELETE OR UPDATE OF "user_id", "book_id", "personal_status" ON "signup_books"',
    )
    expect(sql).toContain('OLD.personal_status IS NULL AND NEW.personal_status IS NOT NULL')
    expect(sql).toContain("CASE WHEN \"status\" IN ('active', 'open') THEN 0 ELSE 1 END")
    expect(sql).toContain('"created_at" DESC')
    expect(sql).toContain('"id" DESC')
    expect(sql).toContain('"kind" = \'hard\'')
    expect(sql).toContain('FROM "matching_book_assignments"')
  })

  it('keeps assignment audit identity stable across a book transfer', () => {
    expect(sql).toContain("IF TG_TABLE_NAME = 'matching_book_assignments' THEN")
    expect(sql).toContain("COALESCE(v_after ->> 'user_id', v_before ->> 'user_id')")
  })
})
