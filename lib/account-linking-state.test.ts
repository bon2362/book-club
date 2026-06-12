/**
 * @jest-environment node
 */

import { createTelegramAccountLinkState, verifyTelegramAccountLinkState } from './account-linking-state'

describe('telegram account linking state', () => {
  beforeEach(() => {
    process.env.NEXTAUTH_SECRET = 'test-secret'
  })

  afterEach(() => {
    delete process.env.NEXTAUTH_SECRET
  })

  it('validates a fresh state for the expected user', () => {
    const now = new Date('2026-01-01T00:00:00Z')
    const state = createTelegramAccountLinkState('user-1', now)

    expect(verifyTelegramAccountLinkState(state, 'user-1', now)).toBe(true)
  })

  it('rejects state for a different user', () => {
    const now = new Date('2026-01-01T00:00:00Z')
    const state = createTelegramAccountLinkState('user-1', now)

    expect(verifyTelegramAccountLinkState(state, 'user-2', now)).toBe(false)
  })

  it('rejects expired state', () => {
    const now = new Date('2026-01-01T00:00:00Z')
    const state = createTelegramAccountLinkState('user-1', now)

    expect(verifyTelegramAccountLinkState(state, 'user-1', new Date('2026-01-01T00:06:00Z'))).toBe(false)
  })
})
