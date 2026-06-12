/**
 * @jest-environment node
 */
import {
  MergeValidationError,
  mergePriorityRows,
  resolveSignupMerge,
  sourceActivityIdsToDrop,
  validateMergeRequest,
} from './user-merge'

describe('admin user merge rules', () => {
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

  it('rejects empty ids, self-merge, missing reason, and admin-as-source', () => {
    expect(() => validateMergeRequest({ sourceUserId: '', targetUserId: 'target', reason: 'x' })).toThrow(MergeValidationError)
    expect(() => validateMergeRequest({ sourceUserId: 'same', targetUserId: 'same', reason: 'x' })).toThrow(MergeValidationError)
    expect(() => validateMergeRequest({ sourceUserId: 'source', targetUserId: 'target', reason: ' ' })).toThrow(MergeValidationError)
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
})
