/**
 * @jest-environment node
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { AUDITED_TABLES } from '../lib/audit/audited-tables'

const sql = readFileSync(join(process.cwd(), 'drizzle/0066_book_collections.sql'), 'utf8')
const TABLES = ['book_collections', 'book_collection_items', 'site_settings']

describe('0066 book collections migration', () => {
  it('создаёт три таблицы', () => {
    for (const table of TABLES) expect(sql).toContain(`CREATE TABLE IF NOT EXISTS "${table}"`)
  })

  it('ограничивает статусы подборки', () => {
    expect(sql).toContain(`CHECK ("status" IN ('draft', 'pending', 'published', 'rejected', 'hidden'))`)
  })

  it('удаляет состав вместе с подборкой и с книгой', () => {
    expect(sql).toContain('REFERENCES "book_collections"("id") ON DELETE CASCADE')
    expect(sql).toContain('REFERENCES "books"("id") ON DELETE CASCADE')
  })

  it('не даёт положить книгу в подборку дважды', () => {
    expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS "book_collection_items_collection_book_unique"')
  })

  it('ставит аудит на все три таблицы и держит реестр в синхронизации', () => {
    for (const table of TABLES) {
      expect(AUDITED_TABLES as readonly string[]).toContain(table)
      expect(sql).toContain(`ON "${table}" FOR EACH ROW EXECUTE FUNCTION audit_capture()`)
    }
  })

  it('не создаёт строку настройки: её отсутствие значит «блок выключен»', () => {
    expect(sql).not.toContain('INSERT INTO "site_settings"')
  })
})
