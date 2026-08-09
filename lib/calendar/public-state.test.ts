import { fetchCalendarPublicState } from './public-state'
import { resolveScheduleBySlug } from './schedule-db'

jest.mock('./schedule-db', () => ({
  resolveScheduleBySlug: jest.fn(),
}))

jest.mock('@/lib/audit/with-audit-context', () => ({
  withAuditContext: jest.fn(),
}))

jest.mock('@/lib/db', () => ({ db: {} }))

const mockResolveScheduleBySlug = resolveScheduleBySlug as jest.MockedFunction<typeof resolveScheduleBySlug>

type QueryChain = {
  from: jest.Mock<QueryChain>
  where: jest.Mock<QueryChain>
  leftJoin: jest.Mock<QueryChain>
  innerJoin: jest.Mock<QueryChain>
  then: (resolve: (rows: unknown[]) => unknown) => Promise<unknown>
}

function emptyQuery(): QueryChain {
  const chain: QueryChain = {
    from: jest.fn(() => chain),
    where: jest.fn(() => chain),
    leftJoin: jest.fn(() => chain),
    innerJoin: jest.fn(() => chain),
    then: (resolve: (rows: unknown[]) => unknown) => Promise.resolve([]).then(resolve),
  }
  return chain
}

const fakeDb = {
  select: jest.fn(() => emptyQuery()),
} as never

function mockSchedule() {
  mockResolveScheduleBySlug.mockResolvedValue({
    id: 'schedule-1',
    sessionId: 'session-1',
    bookId: 'book-1',
    position: 1,
    slug: 'book-circle-1',
    durationMinutes: 60,
    bookTitle: 'Книга',
    bookAuthor: 'Автор',
    circleId: 'circle-1',
    members: [
      {
        userId: 'user-1',
        ref: 'ref-1',
        displayName: 'Анна',
        timezone: 'Europe/Belgrade',
        timezoneConfirmed: true,
      },
    ],
  })
}

describe('fetchCalendarPublicState participant admin ids', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockSchedule()
  })

  it('includes participant user ids for admins', async () => {
    const state = await fetchCalendarPublicState({
      slug: 'book-circle-1',
      viewerUserId: 'admin-1',
      isAdmin: true,
      now: new Date('2026-08-09T10:00:00.000Z'),
    }, fakeDb)

    expect(state.participants[0].adminUserId).toBe('user-1')
  })

  it('does not expose participant user ids to non-admin viewers', async () => {
    const state = await fetchCalendarPublicState({
      slug: 'book-circle-1',
      viewerUserId: 'user-1',
      isAdmin: false,
      now: new Date('2026-08-09T10:00:00.000Z'),
    }, fakeDb)

    expect(state.participants[0]).not.toHaveProperty('adminUserId')
  })
})
