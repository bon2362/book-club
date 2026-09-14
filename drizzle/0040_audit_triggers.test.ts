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

  function matchesOf(pattern: RegExp, text: string): RegExpExecArray[] {
    const found: RegExpExecArray[] = []
    const global = new RegExp(pattern.source, 'gi')
    for (let match = global.exec(text); match; match = global.exec(text)) found.push(match)
    return found
  }

  const TABLE = String.raw`(?:"?public"?\.)?"?(\w+)"?`
  // audit_capture() — общий триггер; у части таблиц своя функция того же семейства
  // (0061: audit_capture_matching_book_assignment() с составным entity_id).
  const AUDIT_TRIGGER = new RegExp(String.raw`ON\s+${TABLE}\s+FOR\s+EACH\s+ROW\s+EXECUTE\s+(?:FUNCTION|PROCEDURE)\s+audit_capture\w*\(\)`)
  const DROP_TRIGGER = new RegExp(String.raw`DROP\s+TRIGGER\s+(?:IF\s+EXISTS\s+)?"?\w+"?\s+ON\s+${TABLE}`)
  const DROP_TABLE = /DROP\s+TABLE\s+(?:IF\s+EXISTS\s+)?([^;]+)/

  /** Таблицы под триггером аудита после прогона всех миграций по порядку. */
  function liveAuditedTables(): string[] {
    const live = new Set<string>()
    for (const migration of migrationSql) {
      const events = [
        ...matchesOf(AUDIT_TRIGGER, migration.sql).map((match) => ({ at: match.index, add: [match[1]], remove: [] as string[] })),
        ...matchesOf(DROP_TRIGGER, migration.sql).map((match) => ({ at: match.index, add: [] as string[], remove: [match[1]] })),
        ...matchesOf(DROP_TABLE, migration.sql).map((match) => ({
          at: match.index,
          add: [] as string[],
          remove: match[1].replace(/\b(?:CASCADE|RESTRICT)\b/gi, '').split(',')
            .map((name) => name.trim().replace(/^(?:"?public"?\.)?"?|"$/g, '')),
        })),
      ].sort((left, right) => left.at - right.at)
      for (const event of events) {
        event.remove.forEach((table) => live.delete(table))
        event.add.forEach((table) => live.add(table))
      }
    }
    return Array.from(live).sort()
  }

  it('defines the audit_capture function reading app.audit_* settings', () => {
    expect(sql).toContain('CREATE OR REPLACE FUNCTION audit_capture()')
    expect(sql).toContain("current_setting('app.audit_actor', true)")
    expect(sql).toContain("COALESCE(NULLIF(current_setting('app.audit_source', true), ''), 'trigger')")
    expect(sql).toContain('TG_TABLE_NAME')
  })

  // Сверка в обе стороны: забытая в реестре новая таблица и оставленная в нём удалённая
  // одинаково ломают журнал аудита. Обратное направление раньше держали снимки отдельных
  // миграций (0056, 0059–0062, 0066); их удалили как устаревшие после применения на прод.
  it('keeps AUDITED_TABLES equal to the tables under an audit trigger after all migrations', () => {
    expect([...AUDITED_TABLES].sort()).toEqual(liveAuditedTables())
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
