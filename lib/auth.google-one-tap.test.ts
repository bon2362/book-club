/**
 * @jest-environment node
 *
 * Unit tests for Google One Tap JWT verification and user upsert logic.
 */

// Mock google-auth-library
jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: jest.fn(),
  })),
}))

jest.mock('@/lib/user-identities', () => ({
  resolveOrCreateUserFromIdentity: jest.fn(),
}))

import { OAuth2Client } from 'google-auth-library'
import { authorizeGoogleOneTap } from './auth.google-one-tap'
import { resolveOrCreateUserFromIdentity } from '@/lib/user-identities'

const mockVerifyIdToken = jest.fn()
const mockGetPayload = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  ;(OAuth2Client as unknown as jest.Mock).mockImplementation(() => ({
    verifyIdToken: mockVerifyIdToken,
  }))
  mockVerifyIdToken.mockResolvedValue({ getPayload: mockGetPayload })
})

const VALID_PAYLOAD = {
  sub: 'google-sub-123',
  email: 'user@example.com',
  name: 'Ivan Petrov',
}

describe('authorizeGoogleOneTap', () => {
  it('returns null when credential is invalid (verifyIdToken throws)', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('Invalid token'))
    const result = await authorizeGoogleOneTap('bad-credential')
    expect(result).toBeNull()
  })

  it('returns null when payload is null', async () => {
    mockGetPayload.mockReturnValue(null)
    const result = await authorizeGoogleOneTap('credential')
    expect(result).toBeNull()
    expect(resolveOrCreateUserFromIdentity).not.toHaveBeenCalled()
  })

  it('returns null when payload has no email', async () => {
    mockGetPayload.mockReturnValue({ sub: 'abc', name: 'No Email' })
    const result = await authorizeGoogleOneTap('credential')
    expect(result).toBeNull()
    expect(resolveOrCreateUserFromIdentity).not.toHaveBeenCalled()
  })

  it('returns user resolved through google identity helper', async () => {
    mockGetPayload.mockReturnValue(VALID_PAYLOAD)
    ;(resolveOrCreateUserFromIdentity as jest.Mock).mockResolvedValue({
      id: 'existing-uuid',
      email: 'user@example.com',
      name: 'Ivan Petrov',
    })

    const result = await authorizeGoogleOneTap('credential')

    expect(result).toEqual({
      id: 'existing-uuid',
      email: 'user@example.com',
      name: 'Ivan Petrov',
    })
    expect(resolveOrCreateUserFromIdentity).toHaveBeenCalledWith('google-one-tap', 'google-sub-123', expect.objectContaining({
      email: 'user@example.com',
      name: 'Ivan Petrov',
      emailVerified: true,
      metadata: { source: 'google-one-tap' },
    }))
  })

  it('falls back to email as name when payload has no name', async () => {
    mockGetPayload.mockReturnValue({ sub: 'abc', email: 'user@example.com' })
    ;(resolveOrCreateUserFromIdentity as jest.Mock).mockResolvedValue({
      id: 'existing-uuid',
      email: 'user@example.com',
      name: 'user@example.com',
    })

    const result = await authorizeGoogleOneTap('credential')

    expect(result!.name).toBe('user@example.com')
  })
})
