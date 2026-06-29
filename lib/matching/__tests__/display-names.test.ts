import { assignMatchingDisplayNames } from '../display-names'

const joinedAt = new Date('2026-06-29T10:00:00Z')

describe('assignMatchingDisplayNames', () => {
  it('keeps a unique global profile name unchanged', () => {
    expect(assignMatchingDisplayNames([
      { userId: 'u1', name: 'Анна', joinedAt, publicRef: 'p1' },
      { userId: 'u2', name: 'Борис', joinedAt, publicRef: 'p2' },
    ])).toEqual(new Map([
      ['u1', 'Анна'],
      ['u2', 'Борис'],
    ]))
  })

  it('adds stable local numbers only to duplicate names', () => {
    const rows = [
      { userId: 'u2', name: 'Анна', joinedAt: new Date('2026-06-29T10:01:00Z'), publicRef: 'p2' },
      { userId: 'u1', name: 'Анна', joinedAt, publicRef: 'p1' },
      { userId: 'u3', name: 'Борис', joinedAt, publicRef: 'p3' },
    ]

    expect(assignMatchingDisplayNames(rows)).toEqual(new Map([
      ['u1', 'Анна (1)'],
      ['u2', 'Анна (2)'],
      ['u3', 'Борис'],
    ]))
    expect(assignMatchingDisplayNames([...rows].reverse())).toEqual(assignMatchingDisplayNames(rows))
  })

  it('uses publicRef as the deterministic tie-breaker', () => {
    expect(assignMatchingDisplayNames([
      { userId: 'u2', name: 'Анна', joinedAt, publicRef: 'p2' },
      { userId: 'u1', name: 'Анна', joinedAt, publicRef: 'p1' },
    ])).toEqual(new Map([
      ['u1', 'Анна (1)'],
      ['u2', 'Анна (2)'],
    ]))
  })

  it('uses a neutral label for an empty profile name', () => {
    expect(assignMatchingDisplayNames([
      { userId: 'u1', name: '  ', joinedAt, publicRef: 'p1' },
    ]).get('u1')).toBe('Без имени')
  })
})
