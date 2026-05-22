/**
 * @jest-environment node
 */

jest.mock('@auth/drizzle-adapter', () => ({
  DrizzleAdapter: jest.fn(() => ({
    createVerificationToken: jest.fn(),
    useVerificationToken: jest.fn(),
    linkAccount: jest.fn(),
  })),
}))

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
  },
}))

import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { IdentityAwareDrizzleAdapter } from './auth-adapter'

function selectChain(rows: unknown[]) {
  return {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(rows),
  }
}

function insertChain(row: unknown) {
  return {
    values: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue([row]),
  }
}

function updateChain(row: unknown) {
  return {
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue([row]),
  }
}

describe('IdentityAwareDrizzleAdapter', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('createUser writes contactEmail but does not write a user.email column', async () => {
    const inserted = {
      id: 'user-id',
      name: 'User',
      contactEmail: 'user@test.com',
      emailVerified: null,
      image: null,
      telegramUsername: null,
    }
    const chain = insertChain(inserted)
    ;(db.insert as jest.Mock).mockReturnValue(chain)

    const adapter = IdentityAwareDrizzleAdapter()
    const user = await adapter.createUser!({
      id: 'user-id',
      name: 'User',
      email: 'User@Test.com',
      emailVerified: null,
      image: null,
    })

    expect(db.insert).toHaveBeenCalledWith(users)
    expect(chain.values).toHaveBeenCalledWith(expect.not.objectContaining({ email: expect.anything() }))
    expect(chain.values).toHaveBeenCalledWith(expect.objectContaining({ contactEmail: 'user@test.com' }))
    expect(user.email).toBe('user@test.com')
  })

  it('getUserByEmail resolves by contact_email before identities', async () => {
    ;(db.select as jest.Mock)
      .mockReturnValueOnce(selectChain([{ id: 'user-id' }]))
      .mockReturnValueOnce(selectChain([{
        id: 'user-id',
        name: 'User',
        contactEmail: 'user@test.com',
        emailVerified: null,
        image: null,
        telegramUsername: null,
      }]))

    const adapter = IdentityAwareDrizzleAdapter()
    const user = await adapter.getUserByEmail!('USER@test.com')

    expect(user?.id).toBe('user-id')
    expect(user?.email).toBe('user@test.com')
  })

  it('updateUser maps email changes to contactEmail', async () => {
    const updated = {
      id: 'user-id',
      name: 'User',
      contactEmail: 'new@test.com',
      emailVerified: null,
      image: null,
      telegramUsername: null,
    }
    const chain = updateChain(updated)
    ;(db.update as jest.Mock).mockReturnValue(chain)

    const adapter = IdentityAwareDrizzleAdapter()
    await adapter.updateUser!({ id: 'user-id', email: 'New@Test.com' })

    expect(chain.set).toHaveBeenCalledWith(expect.objectContaining({ contactEmail: 'new@test.com' }))
    expect(chain.set).toHaveBeenCalledWith(expect.not.objectContaining({ email: expect.anything() }))
  })
})
