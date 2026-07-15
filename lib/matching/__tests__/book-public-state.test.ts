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
const interest = (userId: string, bookId: string, rank: number | null = 1) => ({ userId, bookId, rank })

describe('buildPublicBookModeState', () => {
  it('keeps every viewer shortlist book and sorts by intersections', () => {
    const state = buildPublicBookModeState({
      initializedAt: new Date('2026-07-13T12:00:00Z'), sessionStatus: 'open', viewerUserId: 'u1', admin: false,
      books, participants,
      interests: [
        interest('u1', 'b1'), interest('u1', 'b2'),
        interest('u2', 'b1'), interest('u3', 'b1'),
      ],
      intents: [], assignments: [], formedAtByBookId: new Map(), circles: [],
    })
    expect(state.books.map(book => [book.bookId, book.intersectionCount])).toEqual([['b1', 2], ['b2', 0]])
  })

  it('never exposes raw user ids and pins the viewer assignment', () => {
    const state = buildPublicBookModeState({
      initializedAt: new Date(), sessionStatus: 'open', viewerUserId: 'u1', admin: false,
      books, participants,
      interests: [interest('u1', 'b1'), interest('u1', 'b2'), interest('u2', 'b2')],
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
      interests: participants.map(({ userId }, index) => interest(userId, 'b1', index + 1)),
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
      interests: [interest('u1', 'b1')], intents: [], assignments: [],
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
      interests: [interest('u1', 'b1')], intents: [],
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

  it('sorts shared books by all available ranks without a top-three cutoff', () => {
    const state = buildPublicBookModeState({
      initializedAt: new Date(), sessionStatus: 'open', viewerUserId: 'u1', admin: false,
      books, participants,
      interests: [
        interest('u1', 'b1', 1), interest('u2', 'b1', 8),
        interest('u1', 'b2', 3), interest('u3', 'b2', 4),
      ],
      intents: [], assignments: [], formedAtByBookId: new Map(), circles: [],
    })

    expect(state.books.map(book => book.bookId)).toEqual(['b2', 'b1'])
    expect(state.books.find(book => book.bookId === 'b1')?.participants).toContainEqual(expect.objectContaining({ ref: 'r2', rank: 8 }))
  })

  it('does not let a participant assigned elsewhere improve satisfaction order', () => {
    const rankedBooks = [...books, { bookId: 'b3', title: 'Третья', author: 'Автор', coverUrl: null, sortOrder: 3 }]
    const state = buildPublicBookModeState({
      initializedAt: new Date(), sessionStatus: 'open', viewerUserId: 'u1', admin: false,
      books: rankedBooks, participants,
      interests: [
        interest('u1', 'b1', 5), interest('u2', 'b1', 1),
        interest('u1', 'b2', 3), interest('u3', 'b2', 4),
      ],
      intents: [], assignments: [{ userId: 'u2', bookId: 'b3', circleId: null }],
      formedAtByBookId: new Map(), circles: [],
    })

    expect(state.books.map(book => book.bookId)).toEqual(['b2', 'b1'])
    expect(state.books.find(book => book.bookId === 'b1')?.participants).toContainEqual(expect.objectContaining({ ref: 'r2', rank: 1 }))
  })

  it('uses stable catalog order after equal decision and satisfaction scores', () => {
    const state = buildPublicBookModeState({
      initializedAt: new Date(), sessionStatus: 'open', viewerUserId: 'u1', admin: false,
      books, participants,
      interests: [interest('u1', 'b1', 2), interest('u1', 'b2', 2)],
      intents: [], assignments: [], formedAtByBookId: new Map(), circles: [],
    })

    expect(state.books.map(book => book.bookId)).toEqual(['b2', 'b1'])
  })

  it('keeps the viewer-only books in one tail even when one is conditional', () => {
    const state = buildPublicBookModeState({
      initializedAt: new Date(), sessionStatus: 'open', viewerUserId: 'u1', admin: false,
      books, participants,
      interests: [
        interest('u1', 'b1', 1),
        interest('u1', 'b2', 4), interest('u2', 'b2', 5),
      ],
      intents: [{ userId: 'u1', bookId: 'b1', kind: 'conditional' }], assignments: [],
      formedAtByBookId: new Map(), circles: [],
    })

    expect(state.books.map(book => book.bookId)).toEqual(['b2', 'b1'])
  })

  it('flags conditionalWouldAssign when two other available hard intents already exist', () => {
    const state = buildPublicBookModeState({
      initializedAt: new Date(), sessionStatus: 'open', viewerUserId: 'u1', admin: false,
      books, participants,
      interests: [interest('u1', 'b1', 1)],
      intents: [
        { userId: 'u2', bookId: 'b1', kind: 'hard' },
        { userId: 'u3', bookId: 'b1', kind: 'hard' },
      ],
      assignments: [], formedAtByBookId: new Map(), circles: [],
    })
    const b1 = state.books.find(book => book.bookId === 'b1')!
    expect(b1.conditionalWouldAssign).toBe(true)
    expect(b1.allowedActions.conditional).toBe(true)
  })

  it('keeps conditionalWouldAssign false below the two-hard threshold', () => {
    const state = buildPublicBookModeState({
      initializedAt: new Date(), sessionStatus: 'open', viewerUserId: 'u1', admin: false,
      books, participants,
      interests: [interest('u1', 'b1', 1)],
      intents: [{ userId: 'u2', bookId: 'b1', kind: 'hard' }],
      assignments: [], formedAtByBookId: new Map(), circles: [],
    })
    expect(state.books.find(book => book.bookId === 'b1')!.conditionalWouldAssign).toBe(false)
  })

  it('never flags conditionalWouldAssign when the viewer already committed a hard elsewhere', () => {
    const state = buildPublicBookModeState({
      initializedAt: new Date(), sessionStatus: 'open', viewerUserId: 'u1', admin: false,
      books, participants,
      interests: [interest('u1', 'b1', 1), interest('u1', 'b2', 1)],
      intents: [
        { userId: 'u1', bookId: 'b2', kind: 'hard' },
        { userId: 'u2', bookId: 'b1', kind: 'hard' },
        { userId: 'u3', bookId: 'b1', kind: 'hard' },
      ],
      assignments: [], formedAtByBookId: new Map(), circles: [],
    })
    expect(state.books.find(book => book.bookId === 'b1')!.conditionalWouldAssign).toBe(false)
  })

  it('exposes two stable circles for a book with six assignments', () => {
    const sixParticipants = Array.from({ length: 6 }, (_, index) => ({
      userId: `u${index + 1}`, publicRef: `r${index + 1}`, displayName: `Читатель ${index + 1}`,
    }))
    const state = buildPublicBookModeState({
      initializedAt: new Date(), sessionStatus: 'open', viewerUserId: 'u1', admin: false,
      books, participants: sixParticipants,
      interests: sixParticipants.map(({ userId }, index) => interest(userId, 'b1', index + 1)),
      intents: [],
      assignments: sixParticipants.map(({ userId }, index) => ({
        userId, bookId: 'b1', circleId: index < 3 ? 'circle-1' : 'circle-2',
      })),
      formedAtByBookId: new Map([['b1', new Date('2026-07-13T12:00:00Z')]]),
      circles: [
        { id: 'circle-1', bookId: 'b1', position: 1 },
        { id: 'circle-2', bookId: 'b1', position: 2 },
      ],
    })
    const b1 = state.books.find(book => book.bookId === 'b1')!
    expect(b1.circles).toHaveLength(2)
    expect(b1.circles.map(circle => circle.memberRefs.length)).toEqual([3, 3])
    const viewerCircles = b1.circles.filter(circle => circle.memberRefs.includes('r1'))
    expect(viewerCircles).toHaveLength(1)
    expect(b1.currentViability).toBe('viable')
  })
})
