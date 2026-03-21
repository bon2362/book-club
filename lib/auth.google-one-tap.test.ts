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

// Mock the DB
jest.mock('@/lib/db', () => ({ db: { select: jest.fn(), insert: jest.fn() } }))

import { OAuth2Client } from 'google-auth-library'
import { authorizeGoogleOneTap } from './auth.google-one-tap'
import { db } from '@/lib/db'

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

function mockDbSelect(rows: { id: string }[]) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(rows),
  }
  ;(db.select as jest.Mock).mockReturnValue(chain)
  return chain
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
    expect(db.select).not.toHaveBeenCalled()
  })

  it('returns null when payload has no email', async () => {
    mockGetPayload.mockReturnValue({ sub: 'abc', name: 'No Email' })
    const result = await authorizeGoogleOneTap('credential')
    expect(result).toBeNull()
    expect(db.select).not.toHaveBeenCalled()
  })

  it('returns existing user when found in DB by email', async () => {
    mockGetPayload.mockReturnValue(VALID_PAYLOAD)
    mockDbSelect([{ id: 'existing-uuid' }])

    const result = await authorizeGoogleOneTap('credential')

    expect(result).toEqual({
      id: 'existing-uuid',
      email: 'user@example.com',
      name: 'Ivan Petrov',
    })
    // Should NOT insert anything for existing users
    expect(db.insert).not.toHaveBeenCalled()
  })

  it('creates new user + accounts entry when user not found in DB', async () => {
    mockGetPayload.mockReturnValue(VALID_PAYLOAD)
    mockDbSelect([])
    // Two inserts: users then accounts — use mockReturnValueOnce for correctness
    const chain1 = { values: jest.fn().mockResolvedValue(undefined) }
    const chain2 = { values: jest.fn().mockResolvedValue(undefined) }
    ;(db.insert as jest.Mock).mockReturnValueOnce(chain1).mockReturnValueOnce(chain2)

    const result = await authorizeGoogleOneTap('credential')

    expect(result).not.toBeNull()
    expect(result!.email).toBe('user@example.com')
    expect(result!.name).toBe('Ivan Petrov')
    expect(typeof result!.id).toBe('string')
    // Should insert into both users and accounts
    expect(db.insert).toHaveBeenCalledTimes(2)
    expect(chain1.values).toHaveBeenCalledTimes(1)
    expect(chain2.values).toHaveBeenCalledTimes(1)
  })

  it('falls back to email as name when payload has no name', async () => {
    mockGetPayload.mockReturnValue({ sub: 'abc', email: 'user@example.com' })
    mockDbSelect([{ id: 'existing-uuid' }])

    const result = await authorizeGoogleOneTap('credential')

    expect(result!.name).toBe('user@example.com')
  })
})
