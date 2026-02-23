// Mock DB modules so tests run without a real database connection
jest.mock('@/lib/db', () => ({ db: {} }))
jest.mock('@/lib/db/schema', () => ({ bookCovers: {} }))
jest.mock('drizzle-orm', () => ({ inArray: jest.fn() }))

import { getInitials } from './covers'

describe('getInitials', () => {
  it('returns two initials for two-word name', () => {
    expect(getInitials('Karl Marx')).toBe('KM')
  })

  it('returns two initials for Russian name', () => {
    expect(getInitials('Иван Иванов')).toBe('ИИ')
  })

  it('returns one initial for single-word name', () => {
    expect(getInitials('Plato')).toBe('P')
  })

  it('returns empty string for empty input', () => {
    expect(getInitials('')).toBe('')
  })
})
