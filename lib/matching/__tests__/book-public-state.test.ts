import { buildPublicBookModeState } from '../book-public-state'

const participants = [
  { userId: 'u1', publicRef: 'r1', displayName: 'Анна' },
  { userId: 'u2', publicRef: 'r2', displayName: 'Борис' },
  { userId: 'u3', publicRef: 'r3', displayName: 'Вера' },
]
const books = [
  { bookId: 'b1', title: 'Первая', author: 'Автор', coverUrl: null, sortOrder: 2 },
  { bookId: 'b2', title: 'Вторая', author: 'Автор', coverUrl: null, sortOrder: 1 },
]

describe('buildPublicBookModeState', () => {
  it('keeps every viewer shortlist book and sorts by intersections', () => {
    const state = buildPublicBookModeState({
      initializedAt: new Date('2026-07-13T12:00:00Z'), sessionStatus: 'open', viewerUserId: 'u1', admin: false,
      books, participants,
      interests: [
        { userId: 'u1', bookId: 'b1' }, { userId: 'u1', bookId: 'b2' },
        { userId: 'u2', bookId: 'b1' }, { userId: 'u3', bookId: 'b1' },
      ],
      intents: [], assignments: [], formedAtByBookId: new Map(), circles: [],
    })
    expect(state.books.map(book => [book.bookId, book.intersectionCount])).toEqual([['b1', 2], ['b2', 0]])
  })

  it('never exposes raw user ids and pins the viewer assignment', () => {
    const state = buildPublicBookModeState({
      initializedAt: new Date(), sessionStatus: 'open', viewerUserId: 'u1', admin: false,
      books, participants,
      interests: [{ userId: 'u1', bookId: 'b1' }, { userId: 'u1', bookId: 'b2' }, { userId: 'u2', bookId: 'b2' }],
      intents: [], assignments: [{ userId: 'u1', bookId: 'b1', circleId: null }],
      formedAtByBookId: new Map([['b1', new Date('2026-07-13T12:00:00Z')]]), circles: [],
    })
    expect(state.books[0].bookId).toBe('b1')
    expect(JSON.stringify(state)).not.toContain('u1')
    expect(state.books[0].allowedActions).toEqual({ conditional: false, hard: false, cancelHard: false })
  })

  it('distinguishes historical formation from current viability', () => {
    const state = buildPublicBookModeState({
      initializedAt: new Date(), sessionStatus: 'closed', viewerUserId: 'u1', admin: false,
      books, participants,
      interests: participants.map(({ userId }) => ({ userId, bookId: 'b1' })),
      intents: [], assignments: participants.map(({ userId }) => ({ userId, bookId: 'b1', circleId: null })),
      formedAtByBookId: new Map([['b1', new Date('2026-07-13T12:00:00Z')]]), circles: [],
    })
    expect(state.books[0].formedAt).toBe('2026-07-13T12:00:00.000Z')
    expect(state.books[0].currentViability).toBe('needs_attention')
    expect(state.books[0].unplacedParticipantRefs).toEqual(['r1', 'r2', 'r3'])
  })

  it('exposes internal participant ids only in the privileged admin projection', () => {
    const common = {
      initializedAt: new Date(), sessionStatus: 'open', viewerUserId: 'admin',
      books, participants,
      interests: [{ userId: 'u1', bookId: 'b1' }], intents: [], assignments: [],
      formedAtByBookId: new Map<string, Date>(), circles: [],
    }
    const participant = buildPublicBookModeState({ ...common, viewerUserId: 'u1', admin: false })
    const admin = buildPublicBookModeState({ ...common, admin: true })
    expect(participant.books[0].participants[0]).not.toHaveProperty('adminUserId')
    expect(participant).not.toHaveProperty('adminParticipants')
    expect(admin.books[0].participants[0]).toHaveProperty('adminUserId', 'u1')
    expect(admin.adminParticipants).toHaveLength(3)
    expect(admin.books[0].allowedActions).toEqual({ conditional: false, hard: false, cancelHard: false })
  })

  it('keeps an assignment visible even when its interest row is temporarily absent', () => {
    const state = buildPublicBookModeState({
      initializedAt: new Date(), sessionStatus: 'open', viewerUserId: 'u1', admin: true,
      books, participants,
      interests: [{ userId: 'u1', bookId: 'b1' }], intents: [],
      assignments: [{ userId: 'u2', bookId: 'b1', circleId: null }],
      formedAtByBookId: new Map(), circles: [],
    })
    expect(state.books[0].participants).toContainEqual(expect.objectContaining({
      adminUserId: 'u2', status: 'assigned',
    }))
    expect(state.books[0].intersectionCount).toBe(0)
  })

  it('keeps an admin-created formed book visible before anyone is assigned', () => {
    const state = buildPublicBookModeState({
      initializedAt: new Date(), sessionStatus: 'open', viewerUserId: 'admin', admin: true,
      books, participants, interests: [], intents: [], assignments: [],
      formedAtByBookId: new Map([['b1', new Date('2026-07-13T12:00:00Z')]]),
      circles: [{ id: 'circle-1', bookId: 'b1', position: 1 }],
    })
    expect(state.books[0]).toEqual(expect.objectContaining({
      bookId: 'b1', formedAt: '2026-07-13T12:00:00.000Z', currentViability: 'needs_attention',
    }))
    expect(state.books[0].circles).toEqual([{ id: 'circle-1', position: 1, memberRefs: [] }])
  })
})
