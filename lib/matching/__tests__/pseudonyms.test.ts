import { ANIMALS, assignPseudonym, assignStablePseudonym, assignRandomPseudonymExcluding, PseudonymExhaustedError } from '../pseudonyms'

describe('ANIMALS', () => {
  it('contains at least 200 entries', () => {
    expect(ANIMALS.length).toBeGreaterThanOrEqual(200)
  })

  it('has no duplicates', () => {
    expect(new Set(ANIMALS).size).toBe(ANIMALS.length)
  })

  it('contains only non-empty strings', () => {
    ANIMALS.forEach(a => expect(typeof a).toBe('string'))
    ANIMALS.forEach(a => expect(a.length).toBeGreaterThan(0))
  })
})

describe('assignPseudonym', () => {
  it('returns a value from ANIMALS', () => {
    const result = assignPseudonym(new Set())
    expect(ANIMALS).toContain(result)
  })

  it('never returns a taken pseudonym', () => {
    const taken = new Set(ANIMALS.slice(0, ANIMALS.length - 1))
    const result = assignPseudonym(taken)
    expect(taken.has(result)).toBe(false)
    expect(ANIMALS).toContain(result)
  })

  it('produces 30 unique pseudonyms in sequence', () => {
    const taken = new Set<string>()
    for (let i = 0; i < 30; i++) {
      const p = assignPseudonym(taken)
      expect(taken.has(p)).toBe(false)
      expect(ANIMALS).toContain(p)
      taken.add(p)
    }
    expect(taken.size).toBe(30)
  })

  it('throws PseudonymExhaustedError when all pseudonyms are taken', () => {
    const all = new Set(ANIMALS)
    expect(() => assignPseudonym(all)).toThrow(PseudonymExhaustedError)
    expect(() => assignPseudonym(all)).toThrow('All pseudonyms have been assigned in this session')
  })
})

describe('assignStablePseudonym', () => {
  it('returns the same pseudonym for the same seed while it remains available', () => {
    const seed = 'session-1:user-1'

    expect(assignStablePseudonym(new Set(), seed)).toBe(assignStablePseudonym(new Set(), seed))
  })

  it('uses the next available pseudonym when the seeded candidate is already taken', () => {
    const seed = 'session-1:user-1'
    const first = assignStablePseudonym(new Set(), seed)
    const second = assignStablePseudonym(new Set([first]), seed)

    expect(second).not.toBe(first)
    expect(ANIMALS).toContain(second)
  })

  it('does not mutate the taken set', () => {
    const taken = new Set([assignStablePseudonym(new Set(), 'session-1:user-1')])
    const before = new Set(taken)

    assignStablePseudonym(taken, 'session-1:user-2')

    expect(taken).toEqual(before)
  })

  it('throws PseudonymExhaustedError when all pseudonyms are taken', () => {
    const all = new Set(ANIMALS)

    expect(() => assignStablePseudonym(all, 'session-1:user-1')).toThrow(PseudonymExhaustedError)
  })
})

describe('assignRandomPseudonymExcluding', () => {
  it('returns a pseudonym different from exclude when others are available', () => {
    const exclude = ANIMALS[0]
    for (let i = 0; i < 20; i++) {
      const result = assignRandomPseudonymExcluding(new Set(), exclude)
      expect(result).not.toBe(exclude)
      expect(ANIMALS).toContain(result)
    }
  })

  it('does not return a taken pseudonym', () => {
    const taken = new Set(ANIMALS.slice(1)) // всё занято, кроме ANIMALS[0]
    const result = assignRandomPseudonymExcluding(taken, 'нет-такого')
    expect(result).toBe(ANIMALS[0])
  })

  it('falls back to exclude when it is the only free pseudonym', () => {
    const exclude = ANIMALS[0]
    const taken = new Set(ANIMALS.slice(1)) // свободен только exclude
    expect(assignRandomPseudonymExcluding(taken, exclude)).toBe(exclude)
  })

  it('throws when everything is taken and exclude is also taken', () => {
    const all = new Set(ANIMALS)
    expect(() => assignRandomPseudonymExcluding(all, ANIMALS[0])).toThrow(PseudonymExhaustedError)
  })
})
