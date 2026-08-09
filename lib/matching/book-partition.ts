export interface PartitionAssignment {
  userId: string
  assignedAt: Date
}

export const MIN_CIRCLE_SIZE = 3
export const MAX_CIRCLE_SIZE = 5
export const MIN_FORMATION_HARD_CHOICES = 2
export const MIN_FORMATION_TOTAL_CHOICES = 3

export function shouldFormBook(hardCount: number, conditionalCount: number): boolean {
  return hardCount >= MIN_FORMATION_HARD_CHOICES
    && hardCount + conditionalCount >= MIN_FORMATION_TOTAL_CHOICES
}

export function planBookFormation(input: {
  formed: boolean
  intents: Array<{ userId: string; kind: 'hard' | 'conditional' }>
  assignedToBookUserIds: ReadonlySet<string>
}) {
  if (input.formed) return null
  const available = input.intents.filter(intent => !input.assignedToBookUserIds.has(intent.userId))
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
  if (assignments.length < MIN_CIRCLE_SIZE) return []

  const ordered = [...assignments].sort((left, right) => {
    const byTime = left.assignedAt.getTime() - right.assignedAt.getTime()
    return byTime || left.userId.localeCompare(right.userId)
  })
  const circleCount = Math.ceil(ordered.length / MAX_CIRCLE_SIZE)
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
