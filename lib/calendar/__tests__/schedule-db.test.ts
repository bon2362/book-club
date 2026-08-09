import { pickSlugForCircle } from '@/lib/calendar/schedule-db'

jest.mock('@/lib/db', () => ({ db: {} }))
jest.mock('@/lib/audit/with-audit-context', () => ({
  withAuditContext: jest.fn(),
}))

describe('pickSlugForCircle', () => {
  it('uses the bare slug for the first circle of a book', () => {
    expect(pickSlugForCircle('Заря всего', 1, ['dom-listev'])).toBe('zarya-vsego')
  })

  it('uses the circle number for later circles', () => {
    expect(pickSlugForCircle('Заря всего', 2, ['zarya-vsego'])).toBe('zarya-vsego-2')
  })

  it('skips occupied addresses from other schedules', () => {
    expect(pickSlugForCircle('Заря всего', 2, ['zarya-vsego', 'zarya-vsego-2'])).toBe('zarya-vsego-3')
  })
})
