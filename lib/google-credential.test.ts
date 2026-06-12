/**
 * @jest-environment node
 */

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: jest.fn(),
  })),
}))

import { OAuth2Client } from 'google-auth-library'
import { verifyGoogleCredential } from './google-credential'

const mockVerifyIdToken = jest.fn()

beforeEach(() => {
  jest.clearAllMocks()
  ;(OAuth2Client as unknown as jest.Mock).mockImplementation(() => ({
    verifyIdToken: mockVerifyIdToken,
  }))
})

describe('verifyGoogleCredential', () => {
  it('returns null when verification fails', async () => {
    mockVerifyIdToken.mockRejectedValueOnce(new Error('bad token'))

    const result = await verifyGoogleCredential('credential')

    expect(result).toBeNull()
  })

  it('returns payload when verification succeeds', async () => {
    mockVerifyIdToken.mockResolvedValueOnce({
      getPayload: jest.fn().mockReturnValue({
        sub: 'google-sub-123',
        email: 'user@example.com',
      }),
    })

    const result = await verifyGoogleCredential('credential')

    expect(result).toEqual({
      sub: 'google-sub-123',
      email: 'user@example.com',
    })
  })
})
