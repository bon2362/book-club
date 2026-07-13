export interface PartitionAssignment {
  userId: string
  assignedAt: Date
}

export function shouldFormBook(hardCount: number, conditionalCount: number): boolean {
  return hardCount >= 2 && hardCount + conditionalCount >= 3
}

export function planBookFormation(input: {
  formed: boolean
  intents: Array<{ userId: string; kind: 'hard' | 'conditional' }>
  assignedUserIds: ReadonlySet<string>
}) {
  if (input.formed) return null
  const available = input.intents.filter(intent => !input.assignedUserIds.has(intent.userId))
  const hardCount = available.filter(intent => intent.kind === 'hard').length
  if (!shouldFormBook(hardCount, available.length - hardCount)) return null
  return {
    assignments: available.map(intent => ({ userId: intent.userId, source: intent.kind })),
    clearIntentUserIds: available.map(intent => intent.userId),
  }
}

/**
 * Deterministically distributes assignments into the smallest possible number
 * of balanced circles whose automatic target size is three to five people.
 * Fewer than three assignments stay unplaced until a viable circle exists.
 */
export function partitionBookAssignments<T extends PartitionAssignment>(
  assignments: readonly T[],
): T[][] {
  if (assignments.length < 3) return []

  const ordered = [...assignments].sort((left, right) => {
    const byTime = left.assignedAt.getTime() - right.assignedAt.getTime()
    return byTime || left.userId.localeCompare(right.userId)
  })
  const circleCount = Math.ceil(ordered.length / 5)
  const baseSize = Math.floor(ordered.length / circleCount)
  const largerCircles = ordered.length % circleCount
  const circles: T[][] = []
  let cursor = 0

  for (let index = 0; index < circleCount; index++) {
    const size = baseSize + (index < largerCircles ? 1 : 0)
    circles.push(ordered.slice(cursor, cursor + size))
    cursor += size
  }

  return circles
}
