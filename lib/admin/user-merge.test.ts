/**
 * @jest-environment node
 */
import {
  MergeValidationError,
  mergePriorityRows,
  reconcilePrioritiesWithSignups,
  resolveCanonicalMatchingMerge,
  resolveSignupMerge,
  sourceActivityIdsToDrop,
  validateMergeRequest,
  type PriorityMergeRow,
  type SignupMergeRow,
} from './user-merge'

describe('admin user merge rules', () => {
  const assignment = (userId: string, bookId: string) => ({
    sessionId: 'session-1', userId, bookId, source: 'admin' as const,
    assignedAt: new Date('2026-07-01T00:00:00Z'), assignedBy: null, circleId: null,
  })
  const intent = (userId: string, bookId: string, kind: 'hard' | 'conditional') => ({
    sessionId: 'session-1', userId, bookId, kind,
    createdAt: new Date('2026-07-01T00:00:00Z'), updatedAt: new Date('2026-07-01T00:00:00Z'),
  })

  it('unions assignments by book, preferring the target row on duplicates', () => {
    const merged = resolveCanonicalMatchingMerge({
      targetUserId: 'target',
      targetAssignments: [assignment('target', 'shared-book'), assignment('target', 'target-book')],
      sourceAssignments: [assignment('source', 'shared-book'), assignment('source', 'source-book')],
      targetIntents: [intent('target', 'conditional-book', 'conditional')],
      sourceIntents: [intent('source', 'hard-book', 'hard')],
    })
    expect(merged.assignments.map(row => [row.userId, row.bookId])).toEqual([
      ['target', 'shared-book'], ['target', 'target-book'], ['target', 'source-book'],
    ])
    expect(merged.intents.map(row => [row.bookId, row.kind])).toEqual([['hard-book', 'hard']])
  })

  it('moves source canonical assignment when target has none', () => {
    const merged = resolveCanonicalMatchingMerge({
      targetUserId: 'target', targetAssignments: [],
      sourceAssignments: [assignment('source', 'source-book')], targetIntents: [], sourceIntents: [],
    })
    expect(merged.assignments[0]).toEqual(expect.objectContaining({ userId: 'target', bookId: 'source-book' }))
  })

  it('unions hard intents from both accounts and clears conditionals', () => {
    const merged = resolveCanonicalMatchingMerge({
      targetUserId: 'target', targetAssignments: [], sourceAssignments: [],
      targetIntents: [intent('target', 'target-hard', 'hard'), intent('target', 'conditional', 'conditional')],
      sourceIntents: [intent('source', 'source-hard', 'hard'), intent('source', 'conditional-2', 'conditional')],
    })
    expect(merged.intents.map(row => [row.userId, row.bookId, row.kind])).toEqual([
      ['target', 'target-hard', 'hard'], ['target', 'source-hard', 'hard'],
    ])
  })

  it('unions conditionals when there is no hard intent and excludes assigned books', () => {
    const merged = resolveCanonicalMatchingMerge({
      targetUserId: 'target', targetAssignments: [], sourceAssignments: [],
      targetIntents: [intent('target', 'shared', 'conditional')],
      sourceIntents: [intent('source', 'shared', 'conditional'), intent('source', 'source-only', 'conditional')],
    })
    expect(merged.intents.map(row => [row.userId, row.bookId, row.kind])).toEqual([
      ['target', 'shared', 'conditional'], ['target', 'source-only', 'conditional'],
    ])
  })
  it('validates and trims merge requests', () => {
    expect(validateMergeRequest({
      sourceUserId: ' source ',
      targetUserId: ' target ',
      reason: ' duplicate identities ',
      currentAdminUserId: 'admin',
    })).toEqual({
      sourceUserId: 'source',
      targetUserId: 'target',
      reason: 'duplicate identities',
    })
  })

  it('allows an empty optional reason', () => {
    expect(validateMergeRequest({
      sourceUserId: 'source',
      targetUserId: 'target',
      reason: ' ',
      currentAdminUserId: 'admin',
    })).toEqual({
      sourceUserId: 'source',
      targetUserId: 'target',
      reason: '',
    })
  })

  it('rejects empty ids, self-merge, and admin-as-source', () => {
    expect(() => validateMergeRequest({ sourceUserId: '', targetUserId: 'target', reason: 'x' })).toThrow(MergeValidationError)
    expect(() => validateMergeRequest({ sourceUserId: 'same', targetUserId: 'same', reason: 'x' })).toThrow(MergeValidationError)
    expect(() => validateMergeRequest({
      sourceUserId: 'admin',
      targetUserId: 'target',
      reason: 'x',
      currentAdminUserId: 'admin',
    })).toThrow(MergeValidationError)
  })

  it('merges duplicate signups by earliest signup and strongest status', () => {
    const merged = resolveSignupMerge([
      {
        userId: 'target',
        bookId: 'book-1',
        signedAt: new Date('2026-06-10T10:00:00Z'),
        personalStatus: 'reading',
        personalStatusUpdatedAt: new Date('2026-06-11T10:00:00Z'),
      },
    ], [
      {
        userId: 'source',
        bookId: 'book-1',
        signedAt: new Date('2026-06-01T10:00:00Z'),
        personalStatus: 'read',
        personalStatusUpdatedAt: new Date('2026-06-02T10:00:00Z'),
      },
    ], 'target')

    expect(merged).toEqual([
      {
        userId: 'target',
        bookId: 'book-1',
        signedAt: new Date('2026-06-01T10:00:00Z'),
        personalStatus: 'read',
        personalStatusUpdatedAt: new Date('2026-06-02T10:00:00Z'),
      },
    ])
  })

  it('keeps newest status timestamp when duplicate signup statuses match', () => {
    const merged = resolveSignupMerge([
      {
        bookId: 'book-1',
        signedAt: new Date('2026-06-01T10:00:00Z'),
        personalStatus: 'reading',
        personalStatusUpdatedAt: new Date('2026-06-03T10:00:00Z'),
      },
    ], [
      {
        bookId: 'book-1',
        signedAt: new Date('2026-06-02T10:00:00Z'),
        personalStatus: 'reading',
        personalStatusUpdatedAt: new Date('2026-06-05T10:00:00Z'),
      },
    ], 'target')

    expect(merged[0]).toEqual(expect.objectContaining({
      signedAt: new Date('2026-06-01T10:00:00Z'),
      personalStatus: 'reading',
      personalStatusUpdatedAt: new Date('2026-06-05T10:00:00Z'),
    }))
  })

  it('keeps target priority order first and appends source-only books by rank', () => {
    const merged = mergePriorityRows([
      { userId: 'target', bookId: 'target-second', rank: 2, updatedAt: new Date('2026-06-02T10:00:00Z') },
      { userId: 'target', bookId: 'shared', rank: 1, updatedAt: new Date('2026-06-01T10:00:00Z') },
    ], [
      { userId: 'source', bookId: 'source-second', rank: 20, updatedAt: new Date('2026-06-04T10:00:00Z') },
      { userId: 'source', bookId: 'source-first', rank: 10, updatedAt: new Date('2026-06-03T10:00:00Z') },
      { userId: 'source', bookId: 'shared', rank: 1, updatedAt: new Date('2026-06-05T10:00:00Z') },
    ], 'target')

    expect(merged.map(row => ({ userId: row.userId, bookId: row.bookId, rank: row.rank }))).toEqual([
      { userId: 'target', bookId: 'shared', rank: 1 },
      { userId: 'target', bookId: 'target-second', rank: 2 },
      { userId: 'target', bookId: 'source-first', rank: 3 },
      { userId: 'target', bookId: 'source-second', rank: 4 },
    ])
  })

  it('drops source activity rows that would collide by dedupe key on target', () => {
    expect(sourceActivityIdsToDrop([
      { id: 'target-1', dedupeKey: 'visit:2026-06-12' },
      { id: 'target-2', dedupeKey: null },
    ], [
      { id: 'source-1', dedupeKey: 'visit:2026-06-12' },
      { id: 'source-2', dedupeKey: 'signup:book-1' },
      { id: 'source-3', dedupeKey: null },
    ])).toEqual(['source-1'])
  })

  it('reconciles book_priorities with signup statuses after a mixed merge', () => {
    const signup = (bookId: string, personalStatus: SignupMergeRow['personalStatus'], signedAt: string): SignupMergeRow => ({
      userId: 'target',
      bookId,
      signedAt: new Date(signedAt),
      personalStatus,
      personalStatusUpdatedAt: null,
    })
    const priority = (bookId: string, rank: number, rankSource: 'auto' | 'manual'): Required<PriorityMergeRow> => ({
      userId: 'target',
      bookId,
      rank,
      rankSource,
      updatedAt: new Date('2026-06-01T10:00:00Z'),
    })

    // Смешанный кейс:
    //  - null-book-a: статус null, ранг есть → сохранить (manual)
    //  - reading-book-b: статус reading, но ранг выжил из другого аккаунта → удалить
    //  - null-book-c: статус null, ранга нет (инвариант нарушен) → дописать auto
    const reconciled = reconcilePrioritiesWithSignups(
      [
        signup('null-book-a', null, '2026-06-01T10:00:00Z'),
        signup('reading-book-b', 'reading', '2026-06-02T10:00:00Z'),
        signup('null-book-c', null, '2026-06-03T10:00:00Z'),
      ],
      [
        priority('null-book-a', 1, 'manual'),
        priority('reading-book-b', 2, 'manual'),
      ],
      'target',
    )

    expect(reconciled.map(row => ({ bookId: row.bookId, rank: row.rank, rankSource: row.rankSource }))).toEqual([
      { bookId: 'null-book-a', rank: 1, rankSource: 'manual' },
      { bookId: 'null-book-c', rank: 2, rankSource: 'auto' },
    ])
    // Инвариант: строка ранга есть ровно у книг со статусом null.
    expect(reconciled.every(row => row.userId === 'target')).toBe(true)
    expect(reconciled.some(row => row.bookId === 'reading-book-b')).toBe(false)
  })
})
