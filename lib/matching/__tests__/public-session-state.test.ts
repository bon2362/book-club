import { assemblePublicSessionState } from '../public-state'
import { buildCircleKey } from '../circle-key'

describe('assemblePublicSessionState', () => {
  it('builds active/observer scenarios, confirmation progress, locked registry, and safe notices', () => {
    const circleKey = buildCircleKey({ sessionId: 'session-internal', bookId: 'book-1', memberUserIds: ['u1', 'u2', 'u3'] })
    const state = assemblePublicSessionState({
      session: {
        id: 'session-internal',
        name: 'Июль',
        status: 'active',
        stateVersion: 7,
        minGroupSize: 3,
        maxGroupSize: 3,
        deadlineAt: new Date('2026-07-10T18:00:00Z'),
        frozenSnapshot: null,
      },
      viewerUserId: 'u1',
      participants: [
        { userId: 'u1', publicRef: 'p1', displayName: 'Анна', online: true },
        { userId: 'u2', publicRef: 'p2', displayName: 'Борис', online: false },
        { userId: 'u3', publicRef: 'p3', displayName: 'Вера', online: true },
      ],
      scenarioOverview: {
        totalCount: 3, minGroupSize: 3, maxGroupSize: 3, leader: null,
        scenarios: [{ id: 'internal-scenario', tier: 'leader', leftOut: [], score: {
          coveredCount: 3, totalCount: 3, strongInterestCount: 2, rankedCount: 3,
          unrankedCount: 0, rankSum: 6, avgRank: 2, worstRank: 3,
        }, circles: [{ id: 'internal-circle', bookId: 'book-1', minSize: 3, maxSize: 3,
          wantsCount: 2, avgRank: 2, worstRank: 3, unrankedCount: 0,
          members: [
            { userId: 'u1', displayName: 'Анна', rank: 1, interest: 'очень хочу' },
            { userId: 'u2', displayName: 'Борис', rank: 2, interest: 'очень хочу' },
            { userId: 'u3', displayName: 'Вера', rank: 3, interest: 'очень хочу' },
          ] }],
        }],
      },
      confirmations: [
        { userId: 'u1', bookId: 'book-1', circleKey, memberUserIds: ['u1', 'u2', 'u3'] },
      ],
      lockedCircles: [],
      notices: [{
        id: 'n1',
        kind: 'confirmation_transferred',
        payload: {
          fromMemberDisplayNames: ['Анна', 'Борис'],
          toMemberDisplayNames: ['Анна', 'Вера'],
        },
        createdAt: new Date('2026-06-29T12:00:00Z'),
      }],
    })

    expect(state.viewer).toEqual({ role: 'active', ref: 'p1', lockedCircleKey: null })
    expect(state.scenarios[0].circles[0]).toEqual({
      circleKey,
      bookId: 'book-1',
      members: [
        { ref: 'p1', displayName: 'Анна', rank: 1, interest: 'очень хочу', confirmed: true },
        { ref: 'p2', displayName: 'Борис', rank: 2, interest: 'очень хочу', confirmed: false },
        { ref: 'p3', displayName: 'Вера', rank: 3, interest: 'очень хочу', confirmed: false },
      ],
      avgRank: 2,
      confirmedCount: 1,
      memberCount: 3,
      viewerIsMember: true,
    })
    expect(state.session.deadlineAt).toBe('2026-07-10T18:00:00.000Z')
    expect(state.scenarios[0].score).toEqual({ coveredCount: 3, totalCount: 3, avgRank: 2, worstRank: 3 })
    expect(state.scenarios[0].leftOut).toEqual([])
    expect(state.notices[0].payload).toEqual({
      fromMembers: ['Анна', 'Борис'],
      toMembers: ['Анна', 'Вера'],
    })
    expect(JSON.stringify(state)).not.toContain('"u1"')
    expect(JSON.stringify(state)).not.toContain('session-internal')
    expect(JSON.stringify(state)).not.toContain('internal-scenario')
    expect(JSON.stringify(state)).not.toContain('internal-circle')
  })

  it('marks a member of an active locked circle as observer', () => {
    const state = assemblePublicSessionState({
      session: {
        id: 's1', name: 'Июль', status: 'active', stateVersion: 8,
        minGroupSize: 3, maxGroupSize: 3, deadlineAt: null,
        frozenSnapshot: { remainingLeader: { circles: [{ circleKey: 'opaque-key', bookId: 'book-1', memberUserIds: ['u1'] }] } },
      },
      viewerUserId: 'u1',
      participants: [{ userId: 'u1', publicRef: 'p1', displayName: 'Анна', online: true }],
      scenarioOverview: { scenarios: [], leader: null, totalCount: 0, minGroupSize: 3, maxGroupSize: 3 },
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

    expect(state.viewer).toEqual({ role: 'observer', ref: 'p1', lockedCircleKey: 'circle-a' })
    expect(state.lockedCircles[0]).not.toHaveProperty('id')
    expect(state.lockedCircles[0].members).toEqual([{ ref: 'p1', displayName: 'Анна' }])
    expect(state.session.frozenSnapshot).toEqual({
      remainingLeader: { circles: [{ circleKey: 'opaque-key', bookId: 'book-1', memberRefs: ['p1'] }] },
    })
    expect(JSON.stringify(state.session.frozenSnapshot)).not.toContain('u1')
    expect(JSON.stringify(state)).not.toContain('locked-1')
  })
})
