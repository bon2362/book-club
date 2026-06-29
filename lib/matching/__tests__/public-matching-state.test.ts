import { buildPublicMatchingState } from '../public-state'

const participants = [
  {
    userId: 'internal-user-1',
    publicRef: 'public-1',
    displayName: 'Анна (1)',
    online: true,
    confirmedCircleKey: 'circle-a',
  },
  {
    userId: 'internal-user-2',
    publicRef: 'public-2',
    displayName: 'Анна (2)',
    online: false,
    confirmedCircleKey: null,
  },
]

describe('buildPublicMatchingState', () => {
  it('replaces internal user ids with stable public refs everywhere', () => {
    const state = buildPublicMatchingState({
      participants,
      circles: [{
        circleKey: 'circle-a',
        bookId: 'book-1',
        memberUserIds: ['internal-user-1', 'internal-user-2'],
        confirmedUserIds: ['internal-user-1'],
      }],
    })

    expect(state.participants).toEqual([
      {
        ref: 'public-1',
        displayName: 'Анна (1)',
        online: true,
        confirmedCircleKey: 'circle-a',
      },
      {
        ref: 'public-2',
        displayName: 'Анна (2)',
        online: false,
        confirmedCircleKey: null,
      },
    ])
    expect(state.circles[0]).toEqual({
      circleKey: 'circle-a',
      bookId: 'book-1',
      memberRefs: ['public-1', 'public-2'],
      confirmedRefs: ['public-1'],
    })
    expect(JSON.stringify(state)).not.toContain('internal-user')
  })

  it('fails closed when a circle refers to an unknown participant', () => {
    expect(() => buildPublicMatchingState({
      participants,
      circles: [{
        circleKey: 'circle-a',
        bookId: 'book-1',
        memberUserIds: ['missing-user'],
        confirmedUserIds: [],
      }],
    })).toThrow('Unknown matching participant: missing-user')
  })
})
