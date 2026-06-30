import { fetchMatchingScenarioOverview } from '../scenario-overview-db'

jest.mock('@/lib/db', () => ({ db: {} }))

function fakeDb(results: unknown[][]) {
  let index = 0
  return {
    select: jest.fn(() => {
      const rows = results[index++]
      const query = {
        from: () => query,
        leftJoin: () => query,
        where: () => query,
        limit: async (count: number) => rows.slice(0, count),
        then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
      }
      return query
    }),
  }
}

it('excludes unreleased locked observers before loading satisfaction inputs', async () => {
  const db = fakeDb([
    [{ minGroupSize: 2, maxGroupSize: 2 }],
    [
      { userId: 'u1', publicRef: 'p1', joinedAt: new Date('2026-01-01'), name: 'Анна' },
      { userId: 'u2', publicRef: 'p2', joinedAt: new Date('2026-01-02'), name: 'Борис' },
      { userId: 'observer-id', publicRef: 'p3', joinedAt: new Date('2026-01-03'), name: 'Вера' },
    ],
    [{ userId: 'observer-id' }],
    [
      { userId: 'u1', bookId: 'book-1', personalStatus: null },
      { userId: 'u2', bookId: 'book-1', personalStatus: null },
    ],
    [
      { userId: 'u1', bookId: 'book-1', rank: 1 },
      { userId: 'u2', bookId: 'book-1', rank: 2 },
    ],
    [{ id: 'book-1' }],
  ])

  const overview = await fetchMatchingScenarioOverview('session-id', db as never)

  expect(overview.totalCount).toBe(2)
  expect(overview.scenarios[0].score).toMatchObject({ coveredCount: 2, totalCount: 2, avgRank: 1.5, worstRank: 2 })
  expect(JSON.stringify(overview)).not.toContain('observer-id')
})
