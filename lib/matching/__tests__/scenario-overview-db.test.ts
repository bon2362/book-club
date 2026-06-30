import { buildScenarioInput, fetchMatchingScenarioInput } from '../scenario-input-db'

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

  const input = await fetchMatchingScenarioInput('session-id', db as never)

  expect(input?.participants).toHaveLength(2)
  expect(JSON.stringify(input)).not.toContain('observer-id')
})

it('builds from one participant snapshot and ignores rows from a concurrent join', () => {
  const input = buildScenarioInput({
    session: { minGroupSize: 1, maxGroupSize: 3 },
    participants: [{ userId: 'stable-user', publicRef: 'stable-ref', joinedAt: new Date('2026-01-01'), name: 'Анна' }],
    lockedUserIds: [],
    signups: [
      { userId: 'stable-user', bookId: 'book-1', personalStatus: null },
      { userId: 'concurrent-user', bookId: 'book-1', personalStatus: null },
    ],
    ranks: [
      { userId: 'stable-user', bookId: 'book-1', rank: 1 },
      { userId: 'concurrent-user', bookId: 'book-1', rank: 1 },
    ],
    books: [{ id: 'book-1' }],
  })

  expect(input.participants.map((participant) => participant.userId)).toEqual(['stable-user'])
  expect(input.signups).toEqual([{ userId: 'stable-user', bookId: 'book-1' }])
  expect(input.ranks).toEqual([{ userId: 'stable-user', bookId: 'book-1', rank: 1 }])
  expect(JSON.stringify(input)).not.toContain('concurrent-user')
})
