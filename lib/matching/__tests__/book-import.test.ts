import { planLegacyBookModeImport } from '../book-import'

describe('planLegacyBookModeImport', () => {
  const circles = [{ id: 'circle-1', bookId: 'book-1' }]
  const members = ['u1', 'u2', 'u3'].map(userId => ({ circleId: 'circle-1', userId }))

  it('imports a locked circle and lets its assignment win over an overlapping confirmation', () => {
    const plan = planLegacyBookModeImport({
      participantUserIds: new Set(['u1', 'u2', 'u3', 'u4']), circles, members,
      confirmations: [{ userId: 'u1', bookId: 'other-book' }, { userId: 'u4', bookId: 'book-1' }],
    })
    expect(Array.from(plan.assignedUserIds)).toEqual(['u1', 'u2', 'u3'])
    expect(plan.confirmations).toEqual([{ userId: 'u4', bookId: 'book-1' }])
  })

  it('rejects an invalid snapshot during preflight', () => {
    expect(() => planLegacyBookModeImport({
      participantUserIds: new Set(['u1', 'u2']), circles, members, confirmations: [],
    })).toThrow(expect.objectContaining({ code: 'invalid_book_action' }))
    expect(() => planLegacyBookModeImport({
      participantUserIds: new Set(['u1']), circles, members: [], confirmations: [],
    })).toThrow(expect.objectContaining({ code: 'invalid_book_action' }))
  })
})
