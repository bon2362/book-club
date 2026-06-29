export interface ReconciliationCircle {
  circleKey: string
  bookId: string
  memberUserIds: string[]
}

export interface RankedReconciliationScenario {
  circles: ReconciliationCircle[]
}

export interface CircleConfirmation {
  userId: string
  bookId: string
  circleKey: string
  memberUserIds: string[]
}

export interface ConfirmationTransfer {
  userId: string
  bookId: string
  fromCircleKey: string
  toCircleKey: string
  fromMemberUserIds: string[]
  toMemberUserIds: string[]
}

export interface ConfirmationInvalidation {
  userId: string
  bookId: string
  circleKey: string
  memberUserIds: string[]
}

export interface ReconcileConfirmationsResult {
  confirmations: CircleConfirmation[]
  transfers: ConfirmationTransfer[]
  invalidations: ConfirmationInvalidation[]
  circlesToLock: ReconciliationCircle[]
}

interface RankedCircle {
  circle: ReconciliationCircle
  scenarioIndex: number
}

function rankedCurrentCircles(
  scenarios: RankedReconciliationScenario[],
  lockedMemberUserIds: ReadonlySet<string>,
): RankedCircle[] {
  const byKey = new Map<string, RankedCircle>()

  scenarios.forEach((scenario, scenarioIndex) => {
    for (const circle of scenario.circles) {
      if (circle.memberUserIds.some((userId) => lockedMemberUserIds.has(userId))) continue
      if (!byKey.has(circle.circleKey)) {
        byKey.set(circle.circleKey, { circle, scenarioIndex })
      }
    }
  })

  return Array.from(byKey.values()).sort((a, b) => (
    a.scenarioIndex - b.scenarioIndex || a.circle.circleKey.localeCompare(b.circle.circleKey)
  ))
}

function confirmationsByUser(confirmations: CircleConfirmation[]): Map<string, CircleConfirmation> {
  const result = new Map<string, CircleConfirmation>()
  for (const confirmation of confirmations) {
    if (result.has(confirmation.userId)) {
      throw new Error(`Duplicate matching confirmation: ${confirmation.userId}`)
    }
    result.set(confirmation.userId, confirmation)
  }
  return result
}

export function reconcileConfirmations(input: {
  rankedScenarios: RankedReconciliationScenario[]
  confirmations: CircleConfirmation[]
  lockedMemberUserIds: ReadonlySet<string>
}): ReconcileConfirmationsResult {
  const rankedCircles = rankedCurrentCircles(
    input.rankedScenarios,
    input.lockedMemberUserIds,
  )
  const currentByKey = new Map(rankedCircles.map(({ circle }) => [circle.circleKey, circle]))
  const nextByUser = confirmationsByUser(input.confirmations)
  const transfers: ConfirmationTransfer[] = []
  const invalidations: ConfirmationInvalidation[] = []

  for (const confirmation of input.confirmations) {
    const exactCircle = currentByKey.get(confirmation.circleKey)
    if (exactCircle?.memberUserIds.includes(confirmation.userId)) continue

    const alternative = rankedCircles.find(({ circle }) => (
      circle.bookId === confirmation.bookId &&
      circle.memberUserIds.includes(confirmation.userId)
    ))?.circle

    if (!alternative) {
      nextByUser.delete(confirmation.userId)
      invalidations.push({ ...confirmation })
      continue
    }

    nextByUser.set(confirmation.userId, {
      userId: confirmation.userId,
      bookId: alternative.bookId,
      circleKey: alternative.circleKey,
      memberUserIds: [...alternative.memberUserIds],
    })
    transfers.push({
      userId: confirmation.userId,
      bookId: confirmation.bookId,
      fromCircleKey: confirmation.circleKey,
      toCircleKey: alternative.circleKey,
      fromMemberUserIds: [...confirmation.memberUserIds],
      toMemberUserIds: [...alternative.memberUserIds],
    })
  }

  const circlesToLock = rankedCircles
    .map(({ circle }) => circle)
    .filter((circle) => circle.memberUserIds.every((userId) => (
      nextByUser.get(userId)?.circleKey === circle.circleKey
    )))

  return {
    confirmations: Array.from(nextByUser.values()),
    transfers,
    invalidations,
    circlesToLock,
  }
}

export function runConfirmationCascade(input: {
  activeUserIds: ReadonlySet<string>
  confirmations: CircleConfirmation[]
  recompute: (activeUserIds: ReadonlySet<string>) => RankedReconciliationScenario[]
}): {
  activeUserIds: Set<string>
  confirmations: CircleConfirmation[]
  lockedCircles: ReconciliationCircle[]
  transfers: ConfirmationTransfer[]
  invalidations: ConfirmationInvalidation[]
} {
  const activeUserIds = new Set(input.activeUserIds)
  const allUserIds = new Set(input.activeUserIds)
  let confirmations = [...input.confirmations]
  const lockedCircles: ReconciliationCircle[] = []
  const transfers: ConfirmationTransfer[] = []
  const invalidations: ConfirmationInvalidation[] = []

  for (let iteration = 0; iteration <= allUserIds.size; iteration++) {
    const lockedMemberUserIds = new Set(
      Array.from(allUserIds).filter((userId) => !activeUserIds.has(userId)),
    )
    const reconciled = reconcileConfirmations({
      rankedScenarios: input.recompute(activeUserIds),
      confirmations,
      lockedMemberUserIds,
    })

    confirmations = reconciled.confirmations
    transfers.push(...reconciled.transfers)
    invalidations.push(...reconciled.invalidations)

    const nextCircle = reconciled.circlesToLock[0]
    if (!nextCircle) {
      return { activeUserIds, confirmations, lockedCircles, transfers, invalidations }
    }

    const removedCount = nextCircle.memberUserIds.reduce((count, userId) => (
      activeUserIds.delete(userId) ? count + 1 : count
    ), 0)
    if (removedCount === 0) {
      throw new Error('Matching confirmation cascade did not make progress')
    }

    const lockedUsers = new Set(nextCircle.memberUserIds)
    confirmations = confirmations.filter((item) => !lockedUsers.has(item.userId))
    lockedCircles.push(nextCircle)
  }

  throw new Error('Matching confirmation cascade exceeded participant limit')
}
