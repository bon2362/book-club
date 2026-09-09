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

export interface CircleRebuildPlan {
  /** Circles left untouched: every member has already left matching. */
  preservedCircleIds: string[]
  /** Circles to delete before re-partitioning. */
  removedCircleIds: string[]
  /** Assignments that must lose their circle_id because their circle is going away. */
  detachedUserIds: string[]
  /** Freshly numbered circles, continuing after the highest preserved position. */
  partitions: Array<{ position: number; userIds: string[] }>
}

/**
 * Decides what automatic circle rebuilding may touch for a single book.
 *
 * A circle whose members have all been released to reading is preserved as-is: its
 * position keeps addressing the calendar page (`/calendar/circle/<bookId>/<position>`),
 * and its members are never mixed with newcomers. Everything else is rebuilt.
 *
 * Both inputs are scoped to one book, so positions here never interact with another book's
 * circles — an earlier session-wide implementation shifted unrelated books' positions and
 * could collide with a preserved position, which the unique index rejects.
 */
export function planCircleRebuild(input: {
  circles: ReadonlyArray<{ id: string; position: number }>
  assignments: ReadonlyArray<PartitionAssignment & { circleId: string | null }>
  completedUserIds: ReadonlySet<string>
}): CircleRebuildPlan {
  const membersByCircleId = new Map<string, string[]>()
  for (const assignment of input.assignments) {
    if (assignment.circleId === null) continue
    membersByCircleId.set(assignment.circleId, [
      ...(membersByCircleId.get(assignment.circleId) ?? []),
      assignment.userId,
    ])
  }

  const preserved = input.circles.filter((circle) => {
    const members = membersByCircleId.get(circle.id) ?? []
    return members.length > 0 && members.every(userId => input.completedUserIds.has(userId))
  })
  const preservedCircleIds = new Set(preserved.map(circle => circle.id))
  const removedCircleIds = input.circles
    .filter(circle => !preservedCircleIds.has(circle.id))
    .map(circle => circle.id)

  const detachedUserIds = input.assignments
    .filter(assignment => assignment.circleId !== null && !preservedCircleIds.has(assignment.circleId))
    .map(assignment => assignment.userId)

  // Released participants are out of matching: they are never re-partitioned, even when the
  // circle they sat in is gone. Their assignment simply stays unplaced.
  const rebuildable = input.assignments.filter(assignment => !input.completedUserIds.has(assignment.userId))
  const highestPreservedPosition = preserved.reduce((max, circle) => Math.max(max, circle.position), 0)

  return {
    preservedCircleIds: preserved.map(circle => circle.id),
    removedCircleIds,
    detachedUserIds,
    partitions: partitionBookAssignments(rebuildable).map((partition, index) => ({
      position: highestPreservedPosition + index + 1,
      userIds: partition.map(item => item.userId),
    })),
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
