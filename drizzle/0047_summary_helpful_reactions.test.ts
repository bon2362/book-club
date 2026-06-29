/**
 * @jest-environment node
 */
import { readFileSync } from 'fs'
import { join } from 'path'

describe('0047 summary helpful reactions migration', () => {
  const sql = readFileSync(join(process.cwd(), 'drizzle/0047_summary_helpful_reactions.sql'), 'utf8')

  it('creates the reaction table with cascading references', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "book_summary_helpful_reactions"')
    expect(sql).toContain('FOREIGN KEY ("summary_id") REFERENCES "public"."book_summaries"("id") ON DELETE cascade')
    expect(sql).toContain('FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade')
  })

  it('requires exactly one account or visitor identity', () => {
    expect(sql).toContain('CONSTRAINT "book_summary_helpful_reactions_actor_check" CHECK (num_nonnulls("user_id", "visitor_hash") = 1)')
  })

  it('deduplicates account and visitor reactions independently', () => {
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "book_summary_helpful_reactions_summary_user_unique"')
    expect(sql).toContain('WHERE "user_id" IS NOT NULL')
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "book_summary_helpful_reactions_summary_visitor_unique"')
    expect(sql).toContain('WHERE "visitor_hash" IS NOT NULL')
  })

  it('audits mutations while masking the pseudonymous visitor hash', () => {
    expect(sql).toContain("TG_TABLE_NAME = 'book_summary_helpful_reactions'")
    expect(sql).toContain("v_before := v_before - 'visitor_hash'; v_after := v_after - 'visitor_hash';")
    expect(sql).toContain('CREATE TRIGGER audit_book_summary_helpful_reactions')
    expect(sql).toContain('ON "book_summary_helpful_reactions" FOR EACH ROW EXECUTE FUNCTION audit_capture()')
  })

  it('keeps audit telemetry suppression from the current capture function', () => {
    expect(sql).toContain("TG_TABLE_NAME = 'user' AND v_changed <@ '[\"last_activity_at\"]'::jsonb")
    expect(sql).toContain("TG_TABLE_NAME = 'user_identities' AND v_changed <@ '[\"last_seen_at\"]'::jsonb")
  })
})
