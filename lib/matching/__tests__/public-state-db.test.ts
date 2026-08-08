import { fetchMatchingPublicState } from '../public-state-db'

jest.mock('@/lib/db', () => ({ db: {} }))

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

test('canonical reader exposes only the book state and hides internal user ids', async () => {
  const session = {
    id: 'session-1', name: 'Июль', status: 'active', stateVersion: 1,
    deadlineAt: null,
    createdAt: new Date('2026-07-14T10:00:00Z'),
  }
  const participant = {
    userId: 'viewer-id', publicRef: 'viewer-ref', joinedAt: new Date('2026-01-01'),
    lastSeenAt: null, name: null,
  }
  const db = fakeDb([[session], [participant], [], [], [], [], [], []])

  const state = await fetchMatchingPublicState('session-1', 'viewer-id', db as never)

  expect(state.bookMode).toEqual(expect.objectContaining({ books: [] }))
  expect(state.session.status).toBe('open')
  expect(state.session).not.toHaveProperty('minGroupSize')
  expect(state.session).not.toHaveProperty('maxGroupSize')
  expect(state).not.toHaveProperty('scenarios')
  expect(JSON.stringify(state)).not.toContain('viewer-id')
})

test('canonical reader projects the priority rank into book participants', async () => {
  const session = {
    id: 'session-1', name: 'Июль', status: 'open', stateVersion: 1,
    deadlineAt: null,
    createdAt: new Date('2026-07-14T10:00:00Z'),
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
    [session], [participant], [],
    [{ userId: 'viewer-id', bookId: 'book-1', rank: 7 }],
    [], [], [], [], [book],
  ])

  const state = await fetchMatchingPublicState('session-1', 'viewer-id', db as never)

  expect(state.bookMode.books[0].participants).toContainEqual(expect.objectContaining({
    ref: 'viewer-ref', rank: 7,
  }))
  expect(db.selectedKeys).toContainEqual(expect.arrayContaining(['userId', 'bookId', 'rank']))
})
