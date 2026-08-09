/**
 * @jest-environment node
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { AUDITED_TABLES } from '../lib/audit/audited-tables'

describe('0061 multibook matching migration', () => {
  const sql = readFileSync(join(process.cwd(), 'drizzle/0061_matching_multibook.sql'), 'utf8')

  it('removes the one-hard-intent index', () => {
    expect(sql).toContain('DROP INDEX IF EXISTS "matching_book_intents_session_user_hard_uniq"')
  })

  it('replaces the assignment primary key with session, user and book', () => {
    const oldKey = sql.indexOf('DROP CONSTRAINT IF EXISTS "matching_book_assignments_session_user_pk"')
    const newKey = sql.indexOf(
      'ADD CONSTRAINT "matching_book_assignments_session_user_book_pk" PRIMARY KEY ("session_id", "user_id", "book_id")',
    )

    expect(oldKey).toBeGreaterThanOrEqual(0)
    expect(newKey).toBeGreaterThan(oldKey)
  })

  it('keeps both canonical tables audited and gives each assignment a book-scoped audit id', () => {
    expect(AUDITED_TABLES).toEqual(expect.arrayContaining([
      'matching_book_intents',
      'matching_book_assignments',
    ]))
    expect(sql).toContain('CREATE OR REPLACE FUNCTION audit_capture_matching_book_assignment()')
    expect(sql).toMatch(/v_entity_id := concat_ws\(':'[\s\S]*?session_id[\s\S]*?user_id[\s\S]*?book_id/)
    expect(sql).toContain('CREATE TRIGGER audit_matching_book_assignments')
    expect(sql).toContain('EXECUTE FUNCTION audit_capture_matching_book_assignment()')
  })
})
