/**
 * @jest-environment node
 *
 * Unit tests for Google One Tap JWT verification and user upsert logic.
 */

jest.mock('@/lib/google-credential', () => ({
  verifyGoogleCredential: jest.fn(),
}))

jest.mock('@/lib/user-identities', () => ({
  resolveOrCreateUserFromIdentity: jest.fn(),
}))

import { authorizeGoogleOneTap } from './auth.google-one-tap'
import { verifyGoogleCredential } from '@/lib/google-credential'
import { resolveOrCreateUserFromIdentity } from '@/lib/user-identities'

beforeEach(() => {
  jest.clearAllMocks()
})

const VALID_PAYLOAD = {
  sub: 'google-sub-123',
  email: 'user@example.com',
  name: 'Ivan Petrov',
}

describe('authorizeGoogleOneTap', () => {
  it('returns null when credential is invalid (verifyIdToken throws)', async () => {
    ;(verifyGoogleCredential as jest.Mock).mockResolvedValue(null)
    const result = await authorizeGoogleOneTap('bad-credential')
    expect(result).toBeNull()
  })

  it('returns null when payload is null', async () => {
    ;(verifyGoogleCredential as jest.Mock).mockResolvedValue(null)
    const result = await authorizeGoogleOneTap('credential')
    expect(result).toBeNull()
    expect(resolveOrCreateUserFromIdentity).not.toHaveBeenCalled()
  })

  it('returns null when payload has no email', async () => {
    ;(verifyGoogleCredential as jest.Mock).mockResolvedValue({ sub: 'abc', name: 'No Email' })
    const result = await authorizeGoogleOneTap('credential')
    expect(result).toBeNull()
    expect(resolveOrCreateUserFromIdentity).not.toHaveBeenCalled()
  })

  it('returns user resolved through google identity helper', async () => {
    ;(verifyGoogleCredential as jest.Mock).mockResolvedValue(VALID_PAYLOAD)
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
    ;(verifyGoogleCredential as jest.Mock).mockResolvedValue({ sub: 'abc', email: 'user@example.com' })
    ;(resolveOrCreateUserFromIdentity as jest.Mock).mockResolvedValue({
      id: 'existing-uuid',
      email: 'user@example.com',
      name: 'user@example.com',
    })

    const result = await authorizeGoogleOneTap('credential')

    expect(result!.name).toBe('user@example.com')
  })
})
