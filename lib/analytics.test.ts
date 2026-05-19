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
  opt_out_capturing: jest.fn(),
  opt_in_capturing: jest.fn(),
  has_opted_out_capturing: jest.fn(() => false),
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

describe('identifyUser — opt-out for excluded IDs', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = 'phc_test'
    process.env.NEXT_PUBLIC_POSTHOG_EXCLUDED_USER_IDS = 'owner-uuid-1,owner-uuid-2'
    initPostHog()
  })

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_POSTHOG_EXCLUDED_USER_IDS
  })

  it('calls opt_out_capturing when userId is in excluded list', () => {
    identifyUser('owner-uuid-1')
    expect(posthog.opt_out_capturing).toHaveBeenCalledTimes(1)
    expect(posthog.identify).not.toHaveBeenCalled()
  })

  it('calls opt_out_capturing for the second excluded ID', () => {
    identifyUser('owner-uuid-2')
    expect(posthog.opt_out_capturing).toHaveBeenCalledTimes(1)
  })

  it('does not call opt_out_capturing twice when identifyUser called twice with same excluded ID', () => {
    identifyUser('owner-uuid-1')
    identifyUser('owner-uuid-1')
    expect(posthog.opt_out_capturing).toHaveBeenCalledTimes(1)
  })

  it('does NOT call opt_out_capturing for a regular user', () => {
    identifyUser('regular-user-uuid')
    expect(posthog.opt_out_capturing).not.toHaveBeenCalled()
    expect(posthog.identify).toHaveBeenCalledWith('regular-user-uuid')
  })

  it('does NOT call opt_out_capturing when env var is not set', () => {
    delete process.env.NEXT_PUBLIC_POSTHOG_EXCLUDED_USER_IDS
    identifyUser('owner-uuid-1')
    expect(posthog.opt_out_capturing).not.toHaveBeenCalled()
  })

  it('handles empty EXCLUDED_USER_IDS env var without matching anything', () => {
    process.env.NEXT_PUBLIC_POSTHOG_EXCLUDED_USER_IDS = ''
    identifyUser('owner-uuid-1')
    expect(posthog.opt_out_capturing).not.toHaveBeenCalled()
  })

  it('handles env var with spaces around commas', () => {
    process.env.NEXT_PUBLIC_POSTHOG_EXCLUDED_USER_IDS = ' owner-uuid-1 , owner-uuid-2 '
    identifyUser('owner-uuid-1')
    expect(posthog.opt_out_capturing).toHaveBeenCalledTimes(1)
  })
})

describe('identifyUser — lazy initPostHog (race condition fix)', () => {
  it('initialises PostHog internally so opt-out works even if initPostHog was not called before', () => {
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = 'phc_test'
    process.env.NEXT_PUBLIC_POSTHOG_EXCLUDED_USER_IDS = 'owner-uuid-1'
    // Do NOT call initPostHog() — simulate the race where child effect fires first
    identifyUser('owner-uuid-1')
    expect(posthog.init).toHaveBeenCalledTimes(1)
    expect(posthog.opt_out_capturing).toHaveBeenCalledTimes(1)
    delete process.env.NEXT_PUBLIC_POSTHOG_EXCLUDED_USER_IDS
  })
})

describe('resetIdentity — never re-enables capturing', () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN = 'phc_test'
    initPostHog()
    identifyUser('some-user')
  })

  it('does not call opt_in_capturing on reset', () => {
    resetIdentity()
    expect(posthog.opt_in_capturing).not.toHaveBeenCalled()
  })

  it('calls posthog.reset on reset', () => {
    resetIdentity()
    expect(posthog.reset).toHaveBeenCalled()
  })
})
