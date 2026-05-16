/**
 * @jest-environment node
 */
import { migrateSignupRows } from './migrate-signups'

function makeDb(userRowsByEmail: Record<string, Array<{ id: string; name: string | null; contacts: string | null }>>) {
  const inserted: unknown[] = []
  const updates: unknown[] = []
  let selectCalls = 0
  const db = {
    select: jest.fn(() => ({
      from: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      limit: jest.fn(async () => {
        const email = Object.keys(userRowsByEmail)[selectCalls]
        selectCalls += 1
        return userRowsByEmail[email] ?? []
      }),
    })),
    update: jest.fn(() => ({
      set: jest.fn((value) => {
        updates.push(value)
        return { where: jest.fn().mockResolvedValue(undefined) }
      }),
    })),
    insert: jest.fn(() => ({
      values: jest.fn((value) => {
        inserted.push(value)
        return { onConflictDoNothing: jest.fn().mockResolvedValue(undefined) }
      }),
    })),
  }
  return { db, inserted, updates }
}

describe('migrateSignupRows', () => {
  it('переносит живые строки, пропускает удалённые и backfill только NULL', async () => {
    const { db, inserted, updates } = makeDb({
      'ivan@test.com': [{ id: 'user-1', name: null, contacts: null }],
    })
    const log = { log: jest.fn(), warn: jest.fn() }

    const summary = await migrateSignupRows([
      ['2026-01-01T00:00:00.000Z', 'ivan@test.com', 'Иван', 'ivan@test.com', '@ivan', '["Книга A","Книга B"]', '', ''],
      ['2026-01-02T00:00:00.000Z', 'deleted@test.com', 'Deleted', 'deleted@test.com', '@d', '["Книга C"]', 'TO DELETE', 'yes'],
    ], log, db as never)

    expect(summary.booksInserted).toBe(2)
    expect(summary.rowsSkippedDeleted).toBe(1)
    expect(inserted).toHaveLength(2)
    expect(updates).toEqual([{ name: 'Иван', contacts: '@ivan' }])
  })

  it('логирует orphan и malformed JSON без падения', async () => {
    const { db, inserted } = makeDb({
      'orphan@test.com': [],
    })
    const log = { log: jest.fn(), warn: jest.fn() }

    const summary = await migrateSignupRows([
      ['2026-01-01T00:00:00.000Z', 'orphan@test.com', 'Orphan', 'orphan@test.com', '@o', '["Книга A"]', '', ''],
      ['2026-01-01T00:00:00.000Z', 'bad@test.com', 'Bad', 'bad@test.com', '@b', 'not-json', '', ''],
    ], log, db as never)

    expect(summary.rowsSkippedOrphan).toBe(1)
    expect(summary.rowsSkippedMalformed).toBe(1)
    expect(inserted).toHaveLength(0)
    expect(log.warn).toHaveBeenCalledTimes(2)
  })
})
