import {
  DEMAND_MIN_INTERESTED,
  TOP_RANK_LIMIT,
  buildCoordinationRadar,
  type CoordinationInput,
} from '../coordination-radar'

function participant(userId: string, name: string | null = userId, completedAt: Date | null = null) {
  return { userId, name, completedAt }
}

function wish(userId: string, bookId: string, rank: number | null, title = `Книга ${bookId}`) {
  return { userId, bookId, title, author: 'Автор', rank }
}

function input(overrides: Partial<CoordinationInput>): CoordinationInput {
  return {
    participants: [],
    wishlist: [],
    intents: [],
    assignments: [],
    circles: [],
    reading: [],
    ...overrides,
  }
}

const FIVE = ['u1', 'u2', 'u3', 'u4', 'u5'].map((id) => participant(id, `Участник ${id}`))

describe('buildCoordinationRadar', () => {
  it('uses the product threshold of three interested and a top-three rank window', () => {
    expect({ DEMAND_MIN_INTERESTED, TOP_RANK_LIMIT }).toEqual({ DEMAND_MIN_INTERESTED: 3, TOP_RANK_LIMIT: 3 })
  })

  it('keeps only books with at least three active interested participants', () => {
    const radar = buildCoordinationRadar(input({
      participants: FIVE,
      wishlist: [
        wish('u1', 'a', 1), wish('u2', 'a', 1), wish('u3', 'a', 2),
        wish('u1', 'b', 2), wish('u2', 'b', 2),
      ],
    }))

    expect(radar.books.map((book) => book.bookId)).toEqual(['a'])
    expect(radar.summary.demandedBooks).toBe(1)
  })

  it('excludes participants who already completed their selection from every count', () => {
    const radar = buildCoordinationRadar(input({
      participants: [...FIVE.slice(0, 2), participant('done', 'Готово', new Date('2026-09-01T00:00:00Z'))],
      wishlist: [wish('u1', 'a', 1), wish('u2', 'a', 1), wish('done', 'a', 1)],
      intents: [{ userId: 'done', bookId: 'a', kind: 'hard' }],
      assignments: [{ userId: 'done', bookId: 'x', circleId: 'c-x' }],
      reading: [{ userId: 'done', bookId: 'x', title: 'Икс' }],
    }))

    expect(radar.books).toEqual([])
    expect(radar.summary).toEqual({
      activeParticipants: 2,
      signedUpParticipants: 0,
      assignedParticipants: 0,
      readingParticipants: 0,
      demandedBooks: 0,
      formedCircles: 0,
    })
  })

  it('computes book metrics from people, resolving one strongest status per participant', () => {
    const radar = buildCoordinationRadar(input({
      participants: FIVE,
      wishlist: [
        wish('u1', 'a', 1), wish('u2', 'a', 2), wish('u3', 'a', 4), wish('u4', 'a', null), wish('u5', 'a', 3),
      ],
      intents: [
        { userId: 'u1', bookId: 'a', kind: 'hard' },
        { userId: 'u2', bookId: 'a', kind: 'hard' },
        { userId: 'u3', bookId: 'a', kind: 'conditional' },
      ],
      assignments: [{ userId: 'u1', bookId: 'a', circleId: 'c-1' }],
      circles: [{ id: 'c-1', bookId: 'a' }],
    }))

    const [book] = radar.books
    expect(book).toMatchObject({
      interestedCount: 5,
      topThreeCount: 3,
      avgRank: 2.5,
      worstRank: 4,
      unrankedCount: 1,
      hardCount: 1,
      conditionalCount: 1,
      assignedCount: 1,
      formedCircleCount: 1,
    })
    expect(book.participants.map((person) => [person.userId, person.status, person.assignedCircleId])).toEqual([
      ['u1', 'assigned', 'c-1'],
      ['u2', 'signed_up', null],
      ['u5', 'wishlist', null],
      ['u3', 'conditional', null],
      ['u4', 'wishlist', null],
    ])
  })

  it('sorts by interest, top-three count, average and worst rank, then decisions and title', () => {
    const people = ['u1', 'u2', 'u3', 'u4'].map((id) => participant(id))
    const radar = buildCoordinationRadar(input({
      participants: people,
      wishlist: [
        // four interested — always first
        wish('u1', 'many', 9), wish('u2', 'many', 9), wish('u3', 'many', 9), wish('u4', 'many', 9),
        // three interested, two in top three
        wish('u1', 'top', 1), wish('u2', 'top', 2), wish('u3', 'top', 8),
        // three interested, one in top three: average 3.33
        wish('u1', 'avg', 1), wish('u2', 'avg', 4), wish('u3', 'avg', 5),
        // one in top three, average 4, worst 6
        wish('u1', 'avg-worse', 1), wish('u2', 'avg-worse', 5), wish('u3', 'avg-worse', 6),
        // same top three and average as `avg-worse`, worse worst rank 7
        wish('u1', 'worst', 1), wish('u2', 'worst', 4), wish('u3', 'worst', 7),
      ],
    }))

    expect(radar.books.map((book) => book.bookId)).toEqual(['many', 'top', 'avg', 'avg-worse', 'worst'])
  })

  it('breaks rank ties by hard, then conditional decisions, then title and id', () => {
    const people = ['u1', 'u2', 'u3'].map((id) => participant(id))
    const same = (bookId: string, title: string) => ['u1', 'u2', 'u3'].map((id) => wish(id, bookId, 2, title))
    const radar = buildCoordinationRadar(input({
      participants: people,
      wishlist: [...same('plain-b', 'Бета'), ...same('plain-a', 'Альфа'), ...same('cond', 'Яблоко'), ...same('hard', 'Юла'), ...same('plain-a2', 'Альфа')],
      intents: [
        { userId: 'u1', bookId: 'hard', kind: 'hard' },
        { userId: 'u1', bookId: 'cond', kind: 'conditional' },
      ],
    }))

    expect(radar.books.map((book) => book.bookId)).toEqual(['hard', 'cond', 'plain-a', 'plain-a2', 'plain-b'])
  })

  it('does not let formed circles or assignments change the order', () => {
    const people = ['u1', 'u2', 'u3'].map((id) => participant(id))
    const wishlist = [
      wish('u1', 'first', 1, 'Бэ'), wish('u2', 'first', 1, 'Бэ'), wish('u3', 'first', 1, 'Бэ'),
      wish('u1', 'second', 2, 'А'), wish('u2', 'second', 2, 'А'), wish('u3', 'second', 2, 'А'),
    ]
    const plain = buildCoordinationRadar(input({ participants: people, wishlist }))
    const withCircles = buildCoordinationRadar(input({
      participants: people,
      wishlist,
      assignments: people.map(({ userId }) => ({ userId, bookId: 'second', circleId: 'c-2' })),
      circles: [{ id: 'c-2', bookId: 'second' }],
    }))

    expect(plain.books.map((book) => book.bookId)).toEqual(['first', 'second'])
    expect(withCircles.books.map((book) => book.bookId)).toEqual(['first', 'second'])
    expect(withCircles.books[1].assignedCount).toBe(3)
    expect(withCircles.books[1].hardCount).toBe(0)
  })

  it('returns reading books as reference context without affecting sort or score', () => {
    const people = ['u1', 'u2', 'u3'].map((id) => participant(id))
    const wishlist = [
      wish('u1', 'a', 1, 'Альфа'), wish('u2', 'a', 1, 'Альфа'), wish('u3', 'a', 1, 'Альфа'),
      wish('u1', 'b', 1, 'Бета'), wish('u2', 'b', 1, 'Бета'), wish('u3', 'b', 1, 'Бета'),
    ]
    const radar = buildCoordinationRadar(input({
      participants: people,
      wishlist,
      reading: [
        { userId: 'u1', bookId: 'z', title: 'Янтарь' },
        { userId: 'u1', bookId: 'y', title: 'Ель' },
        { userId: 'u2', bookId: 'a', title: 'Альфа' },
      ],
    }))
    const baseline = buildCoordinationRadar(input({ participants: people, wishlist }))

    expect(radar.books.map((book) => book.bookId)).toEqual(baseline.books.map((book) => book.bookId))
    expect(radar.books[0].participants.find((person) => person.userId === 'u1')?.readingNow)
      .toEqual([{ bookId: 'y', title: 'Ель' }, { bookId: 'z', title: 'Янтарь' }])
    expect(radar.summary.readingParticipants).toBe(2)
    expect({ ...radar.books[0], participants: [] }).toEqual({ ...baseline.books[0], participants: [] })
  })

  it('shows several circles on one book and counts every circle of the session', () => {
    const people = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'].map((id) => participant(id))
    const radar = buildCoordinationRadar(input({
      participants: people,
      wishlist: people.map(({ userId }) => wish(userId, 'a', 1)),
      assignments: people.map(({ userId }, index) => ({ userId, bookId: 'a', circleId: index < 3 ? 'c-1' : 'c-2' })),
      circles: [{ id: 'c-1', bookId: 'a' }, { id: 'c-2', bookId: 'a' }, { id: 'c-3', bookId: 'other' }],
    }))

    expect(radar.books[0].formedCircleCount).toBe(2)
    expect(radar.books[0].assignedCount).toBe(6)
    expect(new Set(radar.books[0].participants.map((person) => person.assignedCircleId))).toEqual(new Set(['c-1', 'c-2']))
    expect(radar.summary.formedCircles).toBe(3)
    expect(radar.summary.assignedParticipants).toBe(6)
  })

  it('sorts unranked values after ranked ones for books and participants', () => {
    const people = ['u1', 'u2', 'u3'].map((id) => participant(id, id === 'u1' ? 'Алла' : 'Борис'))
    const radar = buildCoordinationRadar(input({
      participants: people,
      wishlist: [
        wish('u1', 'unranked', null), wish('u2', 'unranked', null), wish('u3', 'unranked', null),
        wish('u1', 'ranked', 7), wish('u2', 'ranked', null), wish('u3', 'ranked', 9),
      ],
    }))

    expect(radar.books.map((book) => book.bookId)).toEqual(['ranked', 'unranked'])
    expect(radar.books[1]).toMatchObject({ avgRank: null, worstRank: null, unrankedCount: 3 })
    expect(radar.books[0].participants.map((person) => person.rank)).toEqual([7, 9, null])
  })

  it('counts people in the summary, not records', () => {
    const radar = buildCoordinationRadar(input({
      participants: FIVE,
      intents: [
        { userId: 'u1', bookId: 'a', kind: 'hard' },
        { userId: 'u1', bookId: 'b', kind: 'hard' },
        { userId: 'u2', bookId: 'a', kind: 'conditional' },
      ],
      assignments: [
        { userId: 'u3', bookId: 'a', circleId: 'c-1' },
        { userId: 'u3', bookId: 'b', circleId: 'c-2' },
      ],
    }))

    expect(radar.summary).toMatchObject({ activeParticipants: 5, signedUpParticipants: 1, assignedParticipants: 1 })
  })

  it('falls back to a short id when the participant has no name', () => {
    const radar = buildCoordinationRadar(input({
      participants: [participant('user-without-name-000', null), participant('u2'), participant('u3')],
      wishlist: [wish('user-without-name-000', 'a', 1), wish('u2', 'a', 2), wish('u3', 'a', 3)],
    }))

    expect(radar.books[0].participants[0].name).toBe('user-without…')
  })
})
