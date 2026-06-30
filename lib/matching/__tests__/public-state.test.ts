import { buildPublicMatchingState, assemblePublicSessionState } from '../public-state'
import { buildCircleKey } from '../circle-key'
import type { CircleConfirmation } from '../confirmation-reconciliation'

describe('buildPublicMatchingState', () => {
  const participants = [
    { userId: 'uid-1', publicRef: 'ref-1', displayName: 'Анна', online: true, confirmedCircleKey: null },
    { userId: 'uid-2', publicRef: 'ref-2', displayName: 'Борис', online: false, confirmedCircleKey: null },
  ]

  it('maps internal participant state to public refs', () => {
    const result = buildPublicMatchingState({ participants, circles: [] })
    expect(result.participants[0].ref).toBe('ref-1')
    expect(result.participants[1].ref).toBe('ref-2')
    expect(JSON.stringify(result)).not.toContain('uid-1')
  })

  it('maps circle member and confirmed ids to public refs', () => {
    const circles = [{
      circleKey: 'ck1',
      bookId: 'b1',
      memberUserIds: ['uid-1', 'uid-2'],
      confirmedUserIds: ['uid-1'],
    }]
    const result = buildPublicMatchingState({ participants, circles })
    expect(result.circles[0].memberRefs).toEqual(['ref-1', 'ref-2'])
    expect(result.circles[0].confirmedRefs).toEqual(['ref-1'])
    expect(JSON.stringify(result)).not.toContain('uid-')
  })

  it('throws if a circle references an unknown userId', () => {
    const circles = [{
      circleKey: 'ck1',
      bookId: 'b1',
      memberUserIds: ['uid-unknown'],
      confirmedUserIds: [],
    }]
    expect(() => buildPublicMatchingState({ participants, circles })).toThrow()
  })
})

describe('assemblePublicSessionState', () => {
  const session = {
    id: 's1',
    name: 'Тест',
    status: 'active',
    stateVersion: 5,
    minGroupSize: 2,
    maxGroupSize: 4,
    deadlineAt: null,
    frozenSnapshot: null,
  }
  const participants = [
    { userId: 'uid-1', publicRef: 'ref-1', displayName: 'Анна', online: true },
    { userId: 'uid-2', publicRef: 'ref-2', displayName: 'Борис', online: false },
  ]

  const emptyConfirmations: CircleConfirmation[] = []
  const emptyScenarioOverview = { scenarios: [], leader: null, totalCount: 2, minGroupSize: 2, maxGroupSize: 4 }

  it('returns viewer role=active when no locked circle contains the viewer', () => {
    const result = assemblePublicSessionState({
      session,
      viewerUserId: 'uid-1',
      participants,
      scenarioOverview: emptyScenarioOverview,
      confirmations: emptyConfirmations,
      lockedCircles: [],
      notices: [],
    })
    expect(result.viewer.role).toBe('active')
    expect(result.viewer.lockedCircleKey).toBeNull()
  })

  it('returns viewer role=observer when the viewer is in a locked circle', () => {
    const lockedCircles = [{
      id: 'lc1',
      circleKey: 'ck1',
      bookId: 'b1',
      lockedAt: new Date('2026-06-29T10:00:00Z'),
      members: [
        { userId: 'uid-1', displayNameSnapshot: 'Анна' },
        { userId: 'uid-2', displayNameSnapshot: 'Борис' },
      ],
    }]
    const result = assemblePublicSessionState({
      session,
      viewerUserId: 'uid-1',
      participants,
      scenarioOverview: emptyScenarioOverview,
      confirmations: emptyConfirmations,
      lockedCircles,
      notices: [],
    })
    expect(result.viewer.role).toBe('observer')
    expect(result.viewer.lockedCircleKey).toBe('ck1')
  })

  it('maps scenario circles with viewerIsMember and confirmed flags', () => {
    const circleKey = buildCircleKey({ sessionId: 's1', bookId: 'b1', memberUserIds: ['uid-1', 'uid-2'] })
    const scenarioOverview = { ...emptyScenarioOverview, scenarios: [{
      id: 'scenario-internal', tier: 'leader' as const, leftOut: [],
      score: { coveredCount: 2, totalCount: 2, strongInterestCount: 2, rankedCount: 2, unrankedCount: 0, rankSum: 2, avgRank: 1, worstRank: 1 },
      circles: [{ id: 'circle-internal', bookId: 'b1', minSize: 2, maxSize: 4, wantsCount: 2, avgRank: 1, worstRank: 1, unrankedCount: 0,
        members: participants.map((participant) => ({ userId: participant.userId, displayName: participant.displayName, rank: 1, interest: 'очень хочу' as const })) }],
    }] }
    const confirmations: CircleConfirmation[] = [
      { userId: 'uid-1', bookId: 'b1', circleKey, memberUserIds: ['uid-1', 'uid-2'] },
    ]
    const result = assemblePublicSessionState({
      session,
      viewerUserId: 'uid-1',
      participants,
      scenarioOverview,
      confirmations,
      lockedCircles: [],
      notices: [],
    })
    const c = result.scenarios[0].circles[0]
    expect(c.viewerIsMember).toBe(true)
    expect(c.confirmedCount).toBe(1)
    expect(c.members[0].confirmed).toBe(true)
    expect(c.members[1].confirmed).toBe(false)
    expect(JSON.stringify(result)).not.toContain('uid-1')
  })

  it('translates confirmation_transferred notice payload to display names', () => {
    const notices = [{
      id: 'n1',
      kind: 'confirmation_transferred',
      payload: { fromMemberUserIds: ['uid-1'], toMemberUserIds: ['uid-2'] },
      createdAt: new Date('2026-06-29T10:00:00Z'),
    }]
    const result = assemblePublicSessionState({
      session,
      viewerUserId: 'uid-1',
      participants,
      scenarioOverview: emptyScenarioOverview,
      confirmations: emptyConfirmations,
      lockedCircles: [],
      notices,
    })
    expect(result.notices[0].payload.fromMembers).toEqual(['Анна'])
    expect(result.notices[0].payload.toMembers).toEqual(['Борис'])
    expect(JSON.stringify(result)).not.toContain('uid-')
  })

  it('uses durable name snapshots when a transferred member has left the session', () => {
    const notices = [{
      id: 'n1',
      kind: 'confirmation_transferred',
      payload: {
        fromMemberDisplayNames: ['Анна', 'Иван', 'Иван (2)'],
        toMemberDisplayNames: ['Анна', 'Борис'],
      },
      createdAt: new Date('2026-06-29T10:00:00Z'),
    }]
    const result = assemblePublicSessionState({
      session,
      viewerUserId: 'uid-1',
      participants: [participants[0]],
      scenarioOverview: { ...emptyScenarioOverview, totalCount: 1 },
      confirmations: emptyConfirmations,
      lockedCircles: [],
      notices,
    })

    expect(result.notices[0].payload).toEqual({
      fromMembers: ['Анна', 'Иван', 'Иван (2)'],
      toMembers: ['Анна', 'Борис'],
    })
  })

  it('throws if the viewerUserId is not in participants', () => {
    expect(() => assemblePublicSessionState({
      session,
      viewerUserId: 'uid-unknown',
      participants,
      scenarioOverview: emptyScenarioOverview,
      confirmations: emptyConfirmations,
      lockedCircles: [],
      notices: [],
    })).toThrow()
  })
})
