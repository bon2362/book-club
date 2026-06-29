import {
  reconcileConfirmations,
  runConfirmationCascade,
  type CircleConfirmation,
  type ReconciliationCircle,
} from '../confirmation-reconciliation'

function circle(
  circleKey: string,
  bookId: string,
  memberUserIds: string[],
): ReconciliationCircle {
  return { circleKey, bookId, memberUserIds }
}

function confirmation(
  userId: string,
  bookId: string,
  circleKey: string,
  memberUserIds: string[],
): CircleConfirmation {
  return { userId, bookId, circleKey, memberUserIds }
}

describe('reconcileConfirmations', () => {
  it('preserves the exact circle even when it moves to a lower-ranked scenario', () => {
    const current = confirmation('u1', 'b1', 'circle-current', ['u1', 'u2', 'u3'])
    const result = reconcileConfirmations({
      rankedScenarios: [
        { circles: [circle('circle-other', 'b1', ['u1', 'u4', 'u5'])] },
        { circles: [circle('circle-current', 'b1', ['u1', 'u2', 'u3'])] },
      ],
      confirmations: [current],
      lockedMemberUserIds: new Set(),
    })

    expect(result.confirmations).toEqual([current])
    expect(result.transfers).toEqual([])
  })

  it('transfers a vanished circle to the only current circle of the same book containing the user', () => {
    const result = reconcileConfirmations({
      rankedScenarios: [{ circles: [circle('circle-new', 'b1', ['u1', 'u4', 'u5'])] }],
      confirmations: [confirmation('u1', 'b1', 'circle-old', ['u1', 'u2', 'u3'])],
      lockedMemberUserIds: new Set(),
    })

    expect(result.confirmations).toEqual([
      confirmation('u1', 'b1', 'circle-new', ['u1', 'u4', 'u5']),
    ])
    expect(result.transfers).toEqual([{
      userId: 'u1',
      bookId: 'b1',
      fromCircleKey: 'circle-old',
      toCircleKey: 'circle-new',
      fromMemberUserIds: ['u1', 'u2', 'u3'],
      toMemberUserIds: ['u1', 'u4', 'u5'],
    }])
  })

  it('chooses the highest-ranked scenario and a stable key tie-breaker', () => {
    const result = reconcileConfirmations({
      rankedScenarios: [
        { circles: [
          circle('circle-b', 'b1', ['u1', 'u4', 'u5']),
          circle('circle-a', 'b1', ['u1', 'u6', 'u7']),
        ] },
        { circles: [circle('circle-top-later', 'b1', ['u1', 'u8', 'u9'])] },
      ],
      confirmations: [confirmation('u1', 'b1', 'circle-old', ['u1', 'u2', 'u3'])],
      lockedMemberUserIds: new Set(),
    })

    expect(result.confirmations[0].circleKey).toBe('circle-a')
  })

  it('invalidates a confirmation when the book has no alternative circle', () => {
    const result = reconcileConfirmations({
      rankedScenarios: [{ circles: [circle('circle-other-book', 'b2', ['u1', 'u4', 'u5'])] }],
      confirmations: [confirmation('u1', 'b1', 'circle-old', ['u1', 'u2', 'u3'])],
      lockedMemberUserIds: new Set(),
    })

    expect(result.confirmations).toEqual([])
    expect(result.invalidations).toEqual([{
      userId: 'u1',
      bookId: 'b1',
      circleKey: 'circle-old',
      memberUserIds: ['u1', 'u2', 'u3'],
    }])
  })

  it('requires every exact-circle member to confirm that same circle', () => {
    const target = circle('circle-a', 'b1', ['u1', 'u2', 'u3'])
    const base = {
      rankedScenarios: [{ circles: [target] }],
      lockedMemberUserIds: new Set<string>(),
    }

    expect(reconcileConfirmations({
      ...base,
      confirmations: [
        confirmation('u1', 'b1', 'circle-a', target.memberUserIds),
        confirmation('u2', 'b1', 'circle-a', target.memberUserIds),
      ],
    }).circlesToLock).toEqual([])

    expect(reconcileConfirmations({
      ...base,
      confirmations: target.memberUserIds.map((userId) => (
        confirmation(userId, 'b1', 'circle-a', target.memberUserIds)
      )),
    }).circlesToLock).toEqual([target])
  })

  it('lets an automatic transfer complete a quorum immediately', () => {
    const target = circle('circle-new', 'b1', ['u1', 'u2', 'u3'])
    const result = reconcileConfirmations({
      rankedScenarios: [{ circles: [target] }],
      confirmations: [
        confirmation('u1', 'b1', 'circle-old', ['u1', 'u4', 'u5']),
        confirmation('u2', 'b1', 'circle-new', target.memberUserIds),
        confirmation('u3', 'b1', 'circle-new', target.memberUserIds),
      ],
      lockedMemberUserIds: new Set(),
    })

    expect(result.transfers).toHaveLength(1)
    expect(result.circlesToLock).toEqual([target])
  })
})

describe('runConfirmationCascade', () => {
  it('locks ready circles, removes their members, and repeats to a stable state', () => {
    const first = circle('circle-a', 'b1', ['u1', 'u2', 'u3'])
    const second = circle('circle-b', 'b2', ['u4', 'u5', 'u6'])
    const confirmations = [first, second].flatMap((target) => (
      target.memberUserIds.map((userId) => (
        confirmation(userId, target.bookId, target.circleKey, target.memberUserIds)
      ))
    ))
    const recompute = jest.fn((activeUserIds: ReadonlySet<string>) => ([{
      circles: [first, second].filter((target) => (
        target.memberUserIds.every((userId) => activeUserIds.has(userId))
      )),
    }]))

    const result = runConfirmationCascade({
      activeUserIds: new Set(['u1', 'u2', 'u3', 'u4', 'u5', 'u6']),
      confirmations,
      recompute,
    })

    expect(result.lockedCircles).toEqual([first, second])
    expect(result.activeUserIds).toEqual(new Set())
    expect(result.confirmations).toEqual([])
    expect(recompute).toHaveBeenCalledTimes(3)
  })
})
