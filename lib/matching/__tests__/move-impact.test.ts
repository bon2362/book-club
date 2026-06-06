import { buildMoveImpact, sortMovesByImpact } from '../move-impact'
import type { MatchingScenario } from '../scenarios'
import type { MyMoveBook } from '../my-moves'

function score(coveredCount: number, strongInterestCount: number): MatchingScenario['score'] {
  return {
    coveredCount,
    totalCount: 5,
    coverageRatio: coveredCount / 5,
    strongInterestCount,
    rankedCount: coveredCount,
    unrankedCount: 0,
    rankSum: strongInterestCount,
    avgRank: 1,
    worstRank: 2,
  }
}

const previewScenario: MatchingScenario = {
  id: 'preview',
  tier: 'leader',
  score: score(3, 1),
  leftOut: [],
  circles: [],
}

function move(title: string, impact?: MyMoveBook['impact']): MyMoveBook {
  return {
    bookId: title.toLowerCase(),
    title,
    author: 'Author',
    description: '',
    coverUrl: null,
    pages: null,
    publishedDate: '',
    textUrl: '',
    whyRead: null,
    recommendationLink: null,
    tags: [],
    existingParticipants: [],
    impact,
  }
}

describe('move impact helpers', () => {
  it('builds beneficiaries with before leftOut/circle and before-after metrics', () => {
    const currentLeader: MatchingScenario = {
      id: 'before',
      tier: 'leader',
      score: score(3, 1),
      leftOut: [{ userId: 'u3', pseudonym: 'Лягушка' }],
      circles: [
        {
          id: 'old:u2',
          bookId: 'old',
          minSize: 3,
          maxSize: 3,
          wantsCount: 1,
          avgRank: 2,
          worstRank: 3,
          unrankedCount: 0,
          members: [
            { userId: 'viewer', pseudonym: 'Медведка', rank: 2, interest: 'очень хочу' },
            { userId: 'u2', pseudonym: 'Казарка', rank: 4, interest: 'хочу' },
            { userId: 'u4', pseudonym: 'Окунь', rank: 5, interest: 'хочу' },
          ],
        },
      ],
    }
    const nextLeader: MatchingScenario = {
      id: 'after',
      tier: 'leader',
      score: score(4, 3),
      leftOut: [],
      circles: [
        {
          id: 'new:viewer+u2+u3',
          bookId: 'new',
          minSize: 3,
          maxSize: 3,
          wantsCount: 3,
          avgRank: 1.3,
          worstRank: 2,
          unrankedCount: 0,
          members: [
            { userId: 'viewer', pseudonym: 'Медведка', rank: 1, interest: 'очень хочу' },
            { userId: 'u2', pseudonym: 'Казарка', rank: 1, interest: 'очень хочу' },
            { userId: 'u3', pseudonym: 'Лягушка', rank: 2, interest: 'очень хочу' },
            { userId: 'u4', pseudonym: 'Окунь', rank: 5, interest: 'хочу' },
          ],
        },
      ],
    }

    const impact = buildMoveImpact({
      move: { ...move('New'), bookId: 'new' },
      scenario: nextLeader,
      currentLeader,
      viewingUserId: 'viewer',
      bookTitleById: new Map([
        ['old', 'Старая книга'],
        ['new', 'Новая книга'],
      ]),
    })

    expect(impact?.coverage).toEqual({ before: 3, after: 4 })
    expect(impact?.strongInterest).toEqual({ before: 1, after: 3 })
    expect(impact?.previewScenario).toBe(nextLeader)
    expect(impact?.beneficiaries).toEqual([
      {
        userId: 'u2',
        pseudonym: 'Казарка',
        before: { place: 'circle', bookTitle: 'Старая книга', interest: 'хочу' },
        after: 'очень хочу',
      },
      {
        userId: 'u3',
        pseudonym: 'Лягушка',
        before: { place: 'leftOut' },
        after: 'очень хочу',
      },
    ])
  })

  it('does not count passengers whose coverage and interest do not improve', () => {
    const currentLeader: MatchingScenario = {
      id: 'before',
      tier: 'leader',
      score: score(3, 1),
      leftOut: [],
      circles: [
        {
          id: 'old',
          bookId: 'old',
          minSize: 3,
          maxSize: 3,
          wantsCount: 1,
          avgRank: 4,
          worstRank: 5,
          unrankedCount: 0,
          members: [
            { userId: 'viewer', pseudonym: 'Медведка', rank: 3, interest: 'очень хочу' },
            { userId: 'u2', pseudonym: 'Казарка', rank: 4, interest: 'хочу' },
            { userId: 'u3', pseudonym: 'Лягушка', rank: 5, interest: 'хочу' },
          ],
        },
      ],
    }
    const nextLeader: MatchingScenario = {
      id: 'after',
      tier: 'leader',
      score: score(3, 1),
      leftOut: [],
      circles: [
        {
          id: 'new',
          bookId: 'new',
          minSize: 3,
          maxSize: 3,
          wantsCount: 1,
          avgRank: 4,
          worstRank: 5,
          unrankedCount: 0,
          members: [
            { userId: 'viewer', pseudonym: 'Медведка', rank: 1, interest: 'очень хочу' },
            { userId: 'u2', pseudonym: 'Казарка', rank: 4, interest: 'хочу' },
            { userId: 'u3', pseudonym: 'Лягушка', rank: 5, interest: 'хочу' },
          ],
        },
      ],
    }

    const impact = buildMoveImpact({
      move: { ...move('New'), bookId: 'new' },
      scenario: nextLeader,
      currentLeader,
      viewingUserId: 'viewer',
      bookTitleById: new Map([
        ['old', 'Старая книга'],
        ['new', 'Новая книга'],
      ]),
    })

    expect(impact).toBeNull()
  })

  it('keeps a move when a left-out participant joins a strong-preference circle', () => {
    const currentLeader: MatchingScenario = {
      id: 'before',
      tier: 'leader',
      score: score(2, 0),
      leftOut: [{ userId: 'u2', pseudonym: 'Казарка' }],
      circles: [],
    }
    const nextLeader: MatchingScenario = {
      id: 'after',
      tier: 'leader',
      score: score(3, 2),
      leftOut: [],
      circles: [
        {
          id: 'new',
          bookId: 'new',
          minSize: 3,
          maxSize: 3,
          wantsCount: 2,
          avgRank: 1.5,
          worstRank: 2,
          unrankedCount: 0,
          members: [
            { userId: 'viewer', pseudonym: 'Медведка', rank: 1, interest: 'очень хочу' },
            { userId: 'u2', pseudonym: 'Казарка', rank: 2, interest: 'очень хочу' },
            { userId: 'u3', pseudonym: 'Лягушка', rank: null, interest: 'без ранга' },
          ],
        },
      ],
    }

    const impact = buildMoveImpact({
      move: { ...move('New'), bookId: 'new' },
      scenario: nextLeader,
      currentLeader,
      viewingUserId: 'viewer',
      bookTitleById: new Map([['new', 'Новая книга']]),
    })

    expect(impact?.coverage).toEqual({ before: 2, after: 3 })
    expect(impact?.beneficiaries).toEqual([
      {
        userId: 'u2',
        pseudonym: 'Казарка',
        before: { place: 'leftOut' },
        after: 'очень хочу',
      },
      {
        userId: 'u3',
        pseudonym: 'Лягушка',
        before: { place: 'leftOut' },
        after: 'без ранга',
      },
    ])
  })

  it('drops zero-sum moves that only swap in a left-out participant without coverage gain', () => {
    const currentLeader: MatchingScenario = {
      id: 'before',
      tier: 'leader',
      score: score(3, 1),
      leftOut: [{ userId: 'u2', pseudonym: 'Казарка' }],
      circles: [
        {
          id: 'old',
          bookId: 'old',
          minSize: 3,
          maxSize: 3,
          wantsCount: 1,
          avgRank: 2,
          worstRank: 3,
          unrankedCount: 0,
          members: [
            { userId: 'viewer', pseudonym: 'Медведка', rank: 1, interest: 'очень хочу' },
            { userId: 'u3', pseudonym: 'Лягушка', rank: 2, interest: 'очень хочу' },
            { userId: 'u4', pseudonym: 'Окунь', rank: 3, interest: 'очень хочу' },
          ],
        },
      ],
    }
    const nextLeader: MatchingScenario = {
      id: 'after',
      tier: 'leader',
      score: score(3, 1),
      leftOut: [{ userId: 'u3', pseudonym: 'Лягушка' }],
      circles: [
        {
          id: 'new',
          bookId: 'new',
          minSize: 3,
          maxSize: 3,
          wantsCount: 1,
          avgRank: 3,
          worstRank: 4,
          unrankedCount: 1,
          members: [
            { userId: 'viewer', pseudonym: 'Медведка', rank: 1, interest: 'очень хочу' },
            { userId: 'u2', pseudonym: 'Казарка', rank: null, interest: 'без ранга' },
            { userId: 'u4', pseudonym: 'Окунь', rank: 4, interest: 'хочу' },
          ],
        },
      ],
    }

    const impact = buildMoveImpact({
      move: { ...move('New'), bookId: 'new' },
      scenario: nextLeader,
      currentLeader,
      viewingUserId: 'viewer',
      bookTitleById: new Map([
        ['old', 'Старая книга'],
        ['new', 'Новая книга'],
      ]),
    })

    expect(impact).toBeNull()
  })

  it('sorts by coverage gain, then strong-interest gain, then title', () => {
    const moves = [
      move('Бета', {
        scenarioId: 's',
        scenarioTitle: 'Сценарий 1',
        coverageLabel: '',
        summary: '',
        circleTitles: [],
        circleBooks: [],
        previewScenario,
        coverage: { before: 6, after: 6 },
        strongInterest: { before: 2, after: 5 },
        beneficiaries: [],
      }),
      move('Альфа', {
        scenarioId: 's',
        scenarioTitle: 'Сценарий 1',
        coverageLabel: '',
        summary: '',
        circleTitles: [],
        circleBooks: [],
        previewScenario,
        coverage: { before: 6, after: 8 },
        strongInterest: { before: 2, after: 2 },
        beneficiaries: [],
      }),
      move('Гамма', {
        scenarioId: 's',
        scenarioTitle: 'Сценарий 1',
        coverageLabel: '',
        summary: '',
        circleTitles: [],
        circleBooks: [],
        previewScenario,
        coverage: { before: 6, after: 8 },
        strongInterest: { before: 2, after: 4 },
        beneficiaries: [],
      }),
    ]

    expect(sortMovesByImpact(moves).map((m) => m.title)).toEqual(['Гамма', 'Альфа', 'Бета'])
  })

  it('satisfaction mode counts a flat-coverage rank improvement as meaningful', () => {
    const currentLeader: MatchingScenario = {
      id: 'before',
      tier: 'leader',
      score: score(3, 1),
      leftOut: [],
      circles: [{
        id: 'old',
        bookId: 'old',
        minSize: 3,
        maxSize: 3,
        wantsCount: 1,
        avgRank: 4,
        worstRank: 5,
        unrankedCount: 0,
        members: [
          { userId: 'viewer', pseudonym: 'Медведка', rank: 4, interest: 'хочу' },
          { userId: 'u2', pseudonym: 'Казарка', rank: 4, interest: 'хочу' },
          { userId: 'u3', pseudonym: 'Лягушка', rank: 5, interest: 'хочу' },
        ],
      }],
    }
    const better: MatchingScenario = {
      id: 'after',
      tier: 'leader',
      score: score(3, 1),
      leftOut: [],
      circles: [{
        id: 'new',
        bookId: 'new',
        minSize: 3,
        maxSize: 3,
        wantsCount: 1,
        avgRank: 3,
        worstRank: 4,
        unrankedCount: 0,
        members: [
          { userId: 'viewer', pseudonym: 'Медведка', rank: 1, interest: 'очень хочу' },
          { userId: 'u2', pseudonym: 'Казарка', rank: 4, interest: 'хочу' },
          { userId: 'u3', pseudonym: 'Лягушка', rank: 4, interest: 'хочу' },
        ],
      }],
    }

    const impact = buildMoveImpact({
      move: { ...move('New'), bookId: 'new' },
      scenario: better,
      currentLeader,
      viewingUserId: 'viewer',
      bookTitleById: new Map([['new', 'Новая книга']]),
      mode: 'satisfaction',
    })

    expect(impact).not.toBeNull()
    expect(impact?.satisfaction).toEqual({ before: 4, after: 1 })
  })

  it('coverage mode keeps the same flat-coverage move non-meaningful', () => {
    const currentLeader: MatchingScenario = {
      id: 'before',
      tier: 'leader',
      score: score(3, 1),
      leftOut: [],
      circles: [{
        id: 'old',
        bookId: 'old',
        minSize: 3,
        maxSize: 3,
        wantsCount: 1,
        avgRank: 4,
        worstRank: 5,
        unrankedCount: 0,
        members: [
          { userId: 'viewer', pseudonym: 'Медведка', rank: 4, interest: 'хочу' },
          { userId: 'u2', pseudonym: 'Казарка', rank: 4, interest: 'хочу' },
          { userId: 'u3', pseudonym: 'Лягушка', rank: 5, interest: 'хочу' },
        ],
      }],
    }
    const better: MatchingScenario = {
      id: 'after',
      tier: 'leader',
      score: score(3, 1),
      leftOut: [],
      circles: [{
        id: 'new',
        bookId: 'new',
        minSize: 3,
        maxSize: 3,
        wantsCount: 1,
        avgRank: 3,
        worstRank: 4,
        unrankedCount: 0,
        members: [
          { userId: 'viewer', pseudonym: 'Медведка', rank: 1, interest: 'очень хочу' },
          { userId: 'u2', pseudonym: 'Казарка', rank: 4, interest: 'хочу' },
          { userId: 'u3', pseudonym: 'Лягушка', rank: 4, interest: 'хочу' },
        ],
      }],
    }

    const impact = buildMoveImpact({
      move: { ...move('New'), bookId: 'new' },
      scenario: better,
      currentLeader,
      viewingUserId: 'viewer',
      bookTitleById: new Map([['new', 'Новая книга']]),
      mode: 'coverage',
    })

    expect(impact).toBeNull()
  })
})
