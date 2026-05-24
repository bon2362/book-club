// Override the global analytics mock from jest.setup.ts so we can test the real implementation
jest.unmock('@/lib/analytics')

import posthog from 'posthog-js'
import {
  initPostHog,
  identifyUser,
  resetIdentity,
  __resetForTesting,
} from './analytics'

jest.mock('posthog-js', () => ({
  init: jest.fn(),
  capture: jest.fn(),
  identify: jest.fn(),
  reset: jest.fn(),
}))

beforeEach(() => {
  __resetForTesting()
  jest.clearAllMocks()
})

describe('initPostHog', () => {
  it('does not initialise when NEXT_PUBLIC_DISABLE_ANALYTICS is set', () => {
    process.env.NEXT_PUBLIC_DISABLE_ANALYTICS = 'true'
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = 'phc_test'
    initPostHog()
    expect(posthog.init).not.toHaveBeenCalled()
    delete process.env.NEXT_PUBLIC_DISABLE_ANALYTICS
  })

  it('does not initialise when token is missing', () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN
    initPostHog()
    expect(posthog.init).not.toHaveBeenCalled()
  })
})

describe('identifyUser', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = 'phc_test'
    initPostHog()
  })

  it('identifies a user', () => {
    identifyUser('regular-user-uuid')
    expect(posthog.identify).toHaveBeenCalledWith('regular-user-uuid')
  })

  it('does not identify the same user twice', () => {
    identifyUser('regular-user-uuid')
    identifyUser('regular-user-uuid')
    expect(posthog.identify).toHaveBeenCalledTimes(1)
  })
})

describe('identifyUser — lazy initPostHog (race condition fix)', () => {
  it('initialises PostHog internally before identifying the user', () => {
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = 'phc_test'
    // Do NOT call initPostHog() — simulate the race where child effect fires first
    identifyUser('regular-user-uuid')
    expect(posthog.init).toHaveBeenCalledTimes(1)
    expect(posthog.identify).toHaveBeenCalledWith('regular-user-uuid')
  })
})

describe('resetIdentity', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = 'phc_test'
    initPostHog()
    identifyUser('some-user')
  })

  it('calls posthog.reset on reset', () => {
    resetIdentity()
    expect(posthog.reset).toHaveBeenCalled()
  })
})
