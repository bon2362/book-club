/**
 * @jest-environment node
 */
import { readFileSync } from 'fs'
import { join } from 'path'

describe('0043 telegram_login_failures migration', () => {
  const sql = readFileSync(join(process.cwd(), 'drizzle/0043_telegram_login_failures.sql'), 'utf8')

  it('создаёт таблицу telegram_login_failures', () => {
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS "telegram_login_failures"')
  })

  it('содержит колонку reason', () => {
    expect(sql).toContain('"reason" text NOT NULL')
  })

  it('содержит колонку has_hash', () => {
    expect(sql).toContain('"has_hash" boolean NOT NULL')
  })

  it('содержит колонку tg_id', () => {
    expect(sql).toContain('"tg_id" text')
  })

  it('содержит колонку skew_seconds', () => {
    expect(sql).toContain('"skew_seconds" integer')
  })

  it('создаёт индекс по created_at (идемпотентный)', () => {
    expect(sql).toContain('CREATE INDEX IF NOT EXISTS "telegram_login_failures_created_at_idx"')
    expect(sql).toContain('"created_at"')
  })

  it('НЕ навешивает аудит-триггер (намеренно: диагностический журнал без actor)', () => {
    expect(sql).not.toContain('ON "telegram_login_failures" FOR EACH ROW')
  })
})
