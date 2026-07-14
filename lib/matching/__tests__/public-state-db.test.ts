import { fetchMatchingPublicState } from '../public-state-db'
import { fetchMatchingScenarioOverview } from '../scenario-overview-db'

jest.mock('@/lib/db', () => ({ db: {} }))
jest.mock('../scenario-overview-db', () => ({ fetchMatchingScenarioOverview: jest.fn() }))

function fakeDb(results: unknown[][]) {
  let index = 0
  const selectedKeys: string[][] = []
  return {
    selectedKeys,
    select: jest.fn((fields: Record<string, unknown>) => {
      selectedKeys.push(Object.keys(fields))
      const rows = results[index++]
      const query = {
        from: () => query,
        innerJoin: () => query,
        leftJoin: () => query,
        where: () => query,
        orderBy: async () => rows,
        limit: async (count: number) => rows.slice(0, count),
        then: (resolve: (value: unknown[]) => unknown) => Promise.resolve(rows).then(resolve),
      }
      return query
    }),
  }
}

test('public reader selects one session/participant snapshot and injects it into scenario generation', async () => {
  const session = {
    id: 'session-1', name: 'Июль', status: 'active', stateVersion: 1,
    minGroupSize: 1, maxGroupSize: 3, deadlineAt: null, frozenSnapshot: null,
  }
  const participant = {
    userId: 'viewer-id', publicRef: 'viewer-ref', joinedAt: new Date('2026-01-01'),
    lastSeenAt: null, name: null,
  }
  const db = fakeDb([[session], [participant], [], [], []])
  ;(fetchMatchingScenarioOverview as jest.Mock).mockResolvedValue({
    scenarios: [], leader: null, totalCount: 1, minGroupSize: 1, maxGroupSize: 3,
  })

  const state = await fetchMatchingPublicState('session-1', 'viewer-id', db as never)

  expect(db.selectedKeys.filter((keys) => keys.includes('frozenSnapshot'))).toHaveLength(1)
  expect(db.selectedKeys.filter((keys) => keys.includes('lastSeenAt'))).toHaveLength(1)
  expect(fetchMatchingScenarioOverview).toHaveBeenCalledWith('session-1', db, {
    session,
    participants: [participant],
    lockedUserIds: [],
  })
  expect(JSON.stringify(state)).not.toContain('viewer-id')
})

test('book-mode reader projects the priority rank into canonical participants', async () => {
  const session = {
    id: 'session-1', name: 'Июль', status: 'open', stateVersion: 1,
    minGroupSize: 3, maxGroupSize: 5, deadlineAt: null, frozenSnapshot: null,
    bookModeInitializedAt: new Date('2026-07-14T10:00:00Z'),
  }
  const participant = {
    userId: 'viewer-id', publicRef: 'viewer-ref', joinedAt: new Date('2026-01-01'),
    lastSeenAt: null, name: 'Анна',
  }
  const book = {
    bookId: 'book-1', bookSlug: 'book-1', title: 'Книга', author: 'Автор', coverUrl: null,
    sortOrder: 1, description: '', pages: null, publishedDate: '', textUrl: '',
    whyRead: null, recommendationLink: null, tags: [],
  }
  const db = fakeDb([
    [session], [participant], [], [], [],
    [{ userId: 'viewer-id', bookId: 'book-1', rank: 7 }], [], [], [], [], [book],
  ])
  ;(fetchMatchingScenarioOverview as jest.Mock).mockResolvedValue({
    scenarios: [], leader: null, totalCount: 1, minGroupSize: 3, maxGroupSize: 5,
  })

  const state = await fetchMatchingPublicState('session-1', 'viewer-id', db as never)

  expect(state.bookMode?.books[0].participants).toContainEqual(expect.objectContaining({
    ref: 'viewer-ref', rank: 7,
  }))
  expect(db.selectedKeys).toContainEqual(expect.arrayContaining(['userId', 'bookId', 'rank']))
})
