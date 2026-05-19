import '@testing-library/jest-dom'

// Polyfill Node.js globals missing from jsdom (required by @neondatabase/serverless)
import { TextDecoder, TextEncoder } from 'util'
Object.assign(global, { TextDecoder, TextEncoder })

jest.mock('@/lib/analytics', () => ({
  track: jest.fn(),
  initPostHog: jest.fn(),
  capturePageview: jest.fn(),
  isPostHogReady: jest.fn(() => false),
}))
jest.mock('posthog-js', () => ({
  __esModule: true,
  default: {
    init: jest.fn(),
    capture: jest.fn(),
    identify: jest.fn(),
    reset: jest.fn(),
    opt_out_capturing: jest.fn(),
    opt_in_capturing: jest.fn(),
    has_opted_out_capturing: jest.fn(() => false),
  },
}))
