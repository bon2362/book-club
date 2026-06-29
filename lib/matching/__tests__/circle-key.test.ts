import { buildCircleKey } from '../circle-key'

describe('buildCircleKey', () => {
  const base = {
    sessionId: 'session-secret-id',
    bookId: 'book-1',
    memberUserIds: ['user-secret-b', 'user-secret-a'],
  }

  it('is stable when member order changes', () => {
    expect(buildCircleKey(base)).toBe(buildCircleKey({
      ...base,
      memberUserIds: [...base.memberUserIds].reverse(),
    }))
  })

  it('changes for another session, book, or exact member set', () => {
    const key = buildCircleKey(base)

    expect(buildCircleKey({ ...base, sessionId: 'session-2' })).not.toBe(key)
    expect(buildCircleKey({ ...base, bookId: 'book-2' })).not.toBe(key)
    expect(buildCircleKey({ ...base, memberUserIds: ['user-secret-a'] })).not.toBe(key)
  })

  it('does not expose internal identifiers', () => {
    const key = buildCircleKey(base)

    expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(key).not.toContain('session-secret-id')
    expect(key).not.toContain('user-secret')
  })
})
