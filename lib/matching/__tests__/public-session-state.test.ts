import { assemblePublicSessionState } from '../public-state'

describe('assemblePublicSessionState', () => {
  it('builds active/observer scenarios, confirmation progress, locked registry, and safe notices', () => {
    const state = assemblePublicSessionState({
      session: {
        id: 'session-internal',
        name: 'Июль',
        status: 'active',
        stateVersion: 7,
        minGroupSize: 3,
        maxGroupSize: 3,
        frozenSnapshot: null,
      },
      viewerUserId: 'u1',
      participants: [
        { userId: 'u1', publicRef: 'p1', displayName: 'Анна', online: true },
        { userId: 'u2', publicRef: 'p2', displayName: 'Борис', online: false },
        { userId: 'u3', publicRef: 'p3', displayName: 'Вера', online: true },
      ],
      rankedScenarios: [{ circles: [{
        circleKey: 'circle-a',
        bookId: 'book-1',
        memberUserIds: ['u1', 'u2', 'u3'],
      }] }],
      confirmations: [
        { userId: 'u1', bookId: 'book-1', circleKey: 'circle-a', memberUserIds: ['u1', 'u2', 'u3'] },
      ],
      lockedCircles: [],
      notices: [{
        id: 'n1',
        kind: 'confirmation_transferred',
        payload: {
          fromMemberUserIds: ['u1', 'u2'],
          toMemberUserIds: ['u1', 'u3'],
        },
        createdAt: new Date('2026-06-29T12:00:00Z'),
      }],
    })

    expect(state.viewer).toEqual({ role: 'active', ref: 'p1', lockedCircleId: null })
    expect(state.scenarios[0].circles[0]).toEqual({
      circleKey: 'circle-a',
      bookId: 'book-1',
      members: [
        { ref: 'p1', displayName: 'Анна', confirmed: true },
        { ref: 'p2', displayName: 'Борис', confirmed: false },
        { ref: 'p3', displayName: 'Вера', confirmed: false },
      ],
      confirmedCount: 1,
      memberCount: 3,
      viewerIsMember: true,
    })
    expect(state.notices[0].payload).toEqual({
      fromMembers: ['Анна', 'Борис'],
      toMembers: ['Анна', 'Вера'],
    })
    expect(JSON.stringify(state)).not.toContain('"u1"')
    expect(JSON.stringify(state)).not.toContain('session-internal')
  })

  it('marks a member of an active locked circle as observer', () => {
    const state = assemblePublicSessionState({
      session: {
        id: 's1', name: 'Июль', status: 'active', stateVersion: 8,
        minGroupSize: 3, maxGroupSize: 3, frozenSnapshot: null,
      },
      viewerUserId: 'u1',
      participants: [{ userId: 'u1', publicRef: 'p1', displayName: 'Анна', online: true }],
      rankedScenarios: [],
      confirmations: [],
      lockedCircles: [{
        id: 'locked-1',
        circleKey: 'circle-a',
        bookId: 'book-1',
        lockedAt: new Date('2026-06-29T12:00:00Z'),
        members: [{ userId: 'u1', displayNameSnapshot: 'Анна' }],
      }],
      notices: [],
    })

    expect(state.viewer).toEqual({ role: 'observer', ref: 'p1', lockedCircleId: 'locked-1' })
    expect(state.lockedCircles[0].members).toEqual([{ ref: 'p1', displayName: 'Анна' }])
  })
})
