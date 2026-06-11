/**
 * @jest-environment node
 */
import { readFileSync } from 'fs'
import { join } from 'path'

describe('0042 matching presence last_seen migration', () => {
  const sql = readFileSync(join(process.cwd(), 'drizzle/0042_matching_presence_last_seen.sql'), 'utf8')

  it('добавляет колонку last_seen_at участникам', () => {
    expect(sql).toContain('ALTER TABLE "matching_session_participants" ADD COLUMN "last_seen_at"')
  })

  it('пересоздаёт audit_capture с пропуском чисто last_seen_at-апдейтов участников (без шума в аудите)', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION audit_capture()')
    expect(sql).toContain(
      "TG_TABLE_NAME = 'matching_session_participants' AND v_changed <@ '[\"last_seen_at\"]'::jsonb",
    )
  })

  it('сохраняет существующие телеметрические пропуски (user / user_identities)', () => {
    expect(sql).toContain("TG_TABLE_NAME = 'user' AND v_changed <@ '[\"last_activity_at\"]'::jsonb")
    expect(sql).toContain("TG_TABLE_NAME = 'user_identities' AND v_changed <@ '[\"last_seen_at\"]'::jsonb")
  })

  it('сохраняет маскирование секретов', () => {
    expect(sql).toContain("v_before := v_before - 'token'")
    expect(sql).toContain("v_before := v_before - 'token_hash'")
  })
})
