/**
 * @jest-environment node
 */

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  },
}))

import { db } from '@/lib/db'
import { userIdentities, users, verificationTokens } from '@/lib/db/schema'
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
    onConflictDoUpdate: jest.fn().mockReturnThis(),
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

function deleteChain(row: unknown) {
  return {
    where: jest.fn().mockReturnThis(),
    returning: jest.fn().mockResolvedValue(row ? [row] : []),
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

  it('createUser propagates duplicate lower(contact_email) constraint errors', async () => {
    const chain = insertChain(undefined)
    chain.returning.mockRejectedValueOnce(new Error('duplicate key value violates unique constraint "user_contact_email_lower_idx"'))
    ;(db.insert as jest.Mock).mockReturnValue(chain)

    const adapter = IdentityAwareDrizzleAdapter()
    await expect(adapter.createUser!({
      id: 'user-id',
      name: 'User',
      email: 'Alice@Gmail.com',
      emailVerified: null,
      image: null,
    })).rejects.toThrow('user_contact_email_lower_idx')

    expect(chain.values).toHaveBeenCalledWith(expect.objectContaining({ contactEmail: 'alice@gmail.com' }))
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
      }]))

    const adapter = IdentityAwareDrizzleAdapter()
    const user = await adapter.getUserByEmail!('USER@test.com')

    expect(user?.id).toBe('user-id')
    expect(user?.email).toBe('user@test.com')
  })

  it('getUserByEmail falls back to email identity', async () => {
    ;(db.select as jest.Mock)
      .mockReturnValueOnce(selectChain([]))
      .mockReturnValueOnce(selectChain([{ userId: 'identity-user' }]))
      .mockReturnValueOnce(selectChain([{
        id: 'identity-user',
        name: 'Identity User',
        contactEmail: null,
        emailVerified: null,
        image: null,
      }]))

    const adapter = IdentityAwareDrizzleAdapter()
    const user = await adapter.getUserByEmail!('identity@test.com')

    expect(user?.id).toBe('identity-user')
    expect(user?.email).toBeNull()
  })

  it('getUserByAccount resolves by user identity and returns null on miss', async () => {
    ;(db.select as jest.Mock)
      .mockReturnValueOnce(selectChain([{ userId: 'identity-user' }]))
      .mockReturnValueOnce(selectChain([{
        id: 'identity-user',
        name: 'Identity User',
        contactEmail: 'identity@test.com',
        emailVerified: null,
        image: null,
      }]))
      .mockReturnValueOnce(selectChain([]))

    const adapter = IdentityAwareDrizzleAdapter()
    const user = await adapter.getUserByAccount!({ provider: 'google', providerAccountId: 'google-sub' })
    const missing = await adapter.getUserByAccount!({ provider: 'google', providerAccountId: 'missing-sub' })

    expect(user?.id).toBe('identity-user')
    expect(missing).toBeNull()
  })

  it('updateUser maps email changes to contactEmail', async () => {
    const updated = {
      id: 'user-id',
      name: 'User',
      contactEmail: 'new@test.com',
      emailVerified: null,
      image: null,
    }
    const chain = updateChain(updated)
    ;(db.update as jest.Mock).mockReturnValue(chain)

    const adapter = IdentityAwareDrizzleAdapter()
    await adapter.updateUser!({ id: 'user-id', email: 'New@Test.com' })

    expect(chain.set).toHaveBeenCalledWith(expect.objectContaining({ contactEmail: 'new@test.com' }))
    expect(chain.set).toHaveBeenCalledWith(expect.not.objectContaining({ email: expect.anything() }))
  })

  it('linkAccount writes OAuth identity instead of legacy account row', async () => {
    const chain = insertChain(undefined)
    ;(db.insert as jest.Mock).mockReturnValue(chain)

    const adapter = IdentityAwareDrizzleAdapter()
    await adapter.linkAccount!({
      userId: 'user-id',
      provider: 'google',
      providerAccountId: 'google-sub',
      type: 'oidc',
    })

    expect(db.insert).toHaveBeenCalledWith(userIdentities)
    expect(chain.values).toHaveBeenCalledWith(expect.objectContaining({
      userId: 'user-id',
      provider: 'google',
      providerAccountId: 'google-sub',
    }))
    expect(chain.onConflictDoUpdate).toHaveBeenCalledWith(expect.objectContaining({
      target: [userIdentities.provider, userIdentities.providerAccountId],
    }))
  })

  it('getAccount reads from user identities', async () => {
    ;(db.select as jest.Mock)
      .mockReturnValueOnce(selectChain([{ userId: 'user-id' }]))
      .mockReturnValueOnce(selectChain([]))

    const adapter = IdentityAwareDrizzleAdapter()
    const account = await adapter.getAccount!('google-sub', 'google')
    const missing = await adapter.getAccount!('missing-sub', 'google')

    expect(account).toEqual(expect.objectContaining({
      userId: 'user-id',
      type: 'oidc',
      provider: 'google',
      providerAccountId: 'google-sub',
    }))
    expect(missing).toBeNull()
  })

  it('unlinkAccount deletes the identity row', async () => {
    const chain = deleteChain(undefined)
    ;(db.delete as jest.Mock).mockReturnValue(chain)

    const adapter = IdentityAwareDrizzleAdapter()
    await adapter.unlinkAccount!({ provider: 'google', providerAccountId: 'google-sub' })

    expect(db.delete).toHaveBeenCalledWith(userIdentities)
    expect(chain.where).toHaveBeenCalled()
  })

  it('stores and consumes magic-link verification tokens', async () => {
    const token = { identifier: 'user@test.com', token: 'hashed-token', expires: new Date('2026-01-01T00:00:00Z') }
    ;(db.insert as jest.Mock).mockReturnValue(insertChain(token))
    ;(db.delete as jest.Mock).mockReturnValue(deleteChain(token))

    const adapter = IdentityAwareDrizzleAdapter()
    await expect(adapter.createVerificationToken!(token)).resolves.toEqual(token)
    await expect(adapter.useVerificationToken!({ identifier: token.identifier, token: token.token })).resolves.toEqual(token)

    expect(db.insert).toHaveBeenCalledWith(verificationTokens)
    expect(db.delete).toHaveBeenCalledWith(verificationTokens)
  })
})
