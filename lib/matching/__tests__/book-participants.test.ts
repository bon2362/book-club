import { buildPublicBookParticipants } from '../book-participants'

test('maps DB rows to safe client props without raw participant ids', () => {
  const result = buildPublicBookParticipants({
    participants: [
      { userId: 'raw-viewer-id', publicRef: 'viewer-ref', name: 'Анна', joinedAt: new Date('2026-01-01') },
      { userId: 'raw-null-name-id', publicRef: 'other-ref', name: null, joinedAt: new Date('2026-01-02') },
    ],
    signups: [
      { userId: 'raw-viewer-id', bookId: 'book-1', rank: 1, personalStatus: null },
      { userId: 'raw-null-name-id', bookId: 'book-1', rank: 2, personalStatus: null },
    ],
  })

  expect(result).toEqual([
    { ref: 'viewer-ref', bookId: 'book-1', displayName: 'Анна', rank: 1, personalStatus: null },
    { ref: 'other-ref', bookId: 'book-1', displayName: 'Без имени', rank: 2, personalStatus: null },
  ])
  const serialized = JSON.stringify(result)
  expect(serialized).not.toContain('raw-viewer-id')
  expect(serialized).not.toContain('raw-null-name-id')
  expect(serialized).toContain('viewer-ref')
  expect(serialized).toContain('other-ref')
})
