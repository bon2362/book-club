import {
  MAX_CIRCLE_SIZE,
  MIN_CIRCLE_SIZE,
  MIN_FORMATION_HARD_CHOICES,
  MIN_FORMATION_TOTAL_CHOICES,
  partitionBookAssignments,
  planBookFormation,
  shouldFormBook,
} from '../book-partition'

function assignments(count: number) {
  return Array.from({ length: count }, (_, index) => ({
    userId: `user-${String(index).padStart(2, '0')}`,
    assignedAt: new Date(`2026-07-13T12:00:${String(index).padStart(2, '0')}Z`),
  }))
}

describe('partitionBookAssignments', () => {
  it('uses the fixed product limits for circles and formation', () => {
    expect({
      minCircleSize: MIN_CIRCLE_SIZE,
      maxCircleSize: MAX_CIRCLE_SIZE,
      minHardChoices: MIN_FORMATION_HARD_CHOICES,
      minTotalChoices: MIN_FORMATION_TOTAL_CHOICES,
    }).toEqual({
      minCircleSize: 3,
      maxCircleSize: 5,
      minHardChoices: 2,
      minTotalChoices: 3,
    })
  })

  it.each([
    [0, []], [1, []], [2, []],
    [3, [3]], [4, [4]], [5, [5]],
    [6, [3, 3]], [7, [4, 3]], [8, [4, 4]], [9, [5, 4]], [10, [5, 5]],
    [11, [4, 4, 3]], [12, [4, 4, 4]], [13, [5, 4, 4]],
    [14, [5, 5, 4]], [15, [5, 5, 5]], [16, [4, 4, 4, 4]],
    [20, [5, 5, 5, 5]],
  ])('partitions %i assignments as %j', (count, sizes) => {
    expect(partitionBookAssignments(assignments(count)).map(circle => circle.length)).toEqual(sizes)
  })

  it('uses assignedAt and userId as deterministic ordering', () => {
    const sameTime = new Date('2026-07-13T12:00:00Z')
    const result = partitionBookAssignments([
      { userId: 'c', assignedAt: sameTime },
      { userId: 'a', assignedAt: sameTime },
      { userId: 'b', assignedAt: sameTime },
    ])
    expect(result[0].map(item => item.userId)).toEqual(['a', 'b', 'c'])
  })

  it('never loses or duplicates an assignment', () => {
    for (let count = 3; count <= 50; count++) {
      const input = assignments(count)
      const output = partitionBookAssignments(input).flat()
      expect(output.map(item => item.userId).sort()).toEqual(input.map(item => item.userId).sort())
    }
  })
})

describe('shouldFormBook', () => {
  it.each([
    [0, 5, false], [1, 5, false], [2, 0, false], [2, 1, true], [3, 0, true], [2, 5, true],
  ])('evaluates H=%i C=%i as %s', (hard, conditional, expected) => {
    expect(shouldFormBook(hard, conditional)).toBe(expected)
  })
})

describe('planBookFormation', () => {
  const intents = [
    { userId: 'h1', kind: 'hard' as const },
    { userId: 'h2', kind: 'hard' as const },
    { userId: 'c1', kind: 'conditional' as const },
    { userId: 'c2', kind: 'conditional' as const },
  ]

  it('assigns every hard and conditional not already assigned to this book', () => {
    expect(planBookFormation({ formed: false, intents, assignedToBookUserIds: new Set() })).toEqual({
      assignments: [
        { userId: 'h1', source: 'hard' }, { userId: 'h2', source: 'hard' },
        { userId: 'c1', source: 'conditional' }, { userId: 'c2', source: 'conditional' },
      ],
      clearIntentUserIds: ['h1', 'h2', 'c1', 'c2'],
    })
  })

  it('excludes users already assigned to this book before evaluating the threshold', () => {
    expect(planBookFormation({ formed: false, intents, assignedToBookUserIds: new Set(['h2']) })).toBeNull()
  })

  it('does not exclude a user merely because they are assigned to another book', () => {
    expect(planBookFormation({ formed: false, intents, assignedToBookUserIds: new Set() })?.assignments)
      .toContainEqual({ userId: 'h2', source: 'hard' })
  })

  it('never reforms a historical formed book', () => {
    expect(planBookFormation({ formed: true, intents, assignedToBookUserIds: new Set() })).toBeNull()
  })
})
