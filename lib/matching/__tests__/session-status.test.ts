import {
  isMatchingSessionClosed,
  isMatchingSessionOpen,
  normalizeMatchingSessionStatus,
} from '../session-status'

test.each([
  ['active', 'open'],
  ['open', 'open'],
  ['frozen', 'closed'],
  ['closed', 'closed'],
] as const)('normalizes transitional status %s to %s', (status, expected) => {
  expect(normalizeMatchingSessionStatus(status)).toBe(expected)
})

test('recognizes both generations of open and closed statuses', () => {
  expect(['active', 'open'].every(isMatchingSessionOpen)).toBe(true)
  expect(['frozen', 'closed'].every(isMatchingSessionClosed)).toBe(true)
  expect(isMatchingSessionOpen('frozen')).toBe(false)
  expect(isMatchingSessionClosed('active')).toBe(false)
})
