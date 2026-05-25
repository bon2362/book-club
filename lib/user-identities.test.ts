/**
 * @jest-environment node
 */

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
    transaction: jest.fn(),
  },
}))

import { db } from '@/lib/db'
import { userActivityEvents, userIdentities, users } from '@/lib/db/schema'
import {
  IdentityConflictError,
  linkIdentityToUser,
  normalizeIdentityProvider,
  normalizeTelegramContact,
  resolveOrCreateUserFromIdentity,
} from './user-identities'

type InsertChain = {
  table: unknown
  lastValues?: Record<string, unknown>
  values: jest.Mock
  onConflictDoUpdate: jest.Mock
  onConflictDoNothing: jest.Mock
  returning: jest.Mock
}

function queueSelects(...rows: unknown[][]) {
  const queue = [...rows]
  ;(db.select as jest.Mock).mockImplementation(() => ({
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(queue.shift() ?? []),
  }))
}

function mockInserts() {
  const chains: InsertChain[] = []
  ;(db.insert as jest.Mock).mockImplementation((table: unknown) => {
    const chain: InsertChain = {
      table,
      values: jest.fn((values: Record<string, unknown>) => {
        chain.lastValues = values
        return chain
      }),
      onConflictDoUpdate: jest.fn(() => chain),
      onConflictDoNothing: jest.fn(() => Promise.resolve(undefined)),
      returning: jest.fn(() => Promise.resolve([{ userId: chain.lastValues?.userId }])),
    }
    chains.push(chain)
    return chain
  })
  return chains
}

function mockUpdate() {
  const chain = {
    set: jest.fn().mockReturnThis(),
    where: jest.fn().mockResolvedValue(undefined),
  }
  ;(db.update as jest.Mock).mockReturnValue(chain)
  return chain
}

describe('user identity helpers', () => {
  beforeEach(() => {
    jest.restoreAllMocks()
    jest.clearAllMocks()
    ;(db.transaction as jest.Mock).mockImplementation(async (callback) => callback(db))
  })

  it('нормализует provider aliases и Telegram contact', () => {
    expect(normalizeIdentityProvider('google-one-tap')).toBe('google')
    expect(normalizeIdentityProvider('resend')).toBe('email')
    expect(normalizeIdentityProvider('telegram-preauth')).toBe('telegram')
    expect(normalizeTelegramContact(' @reader ')).toBe('reader')
    expect(normalizeTelegramContact('')).toBeNull()
  })

  it('использует transaction для identity sync', async () => {
    queueSelects(
      [{ userId: 'user-uuid' }],
      [{ id: 'user-uuid', email: 'u@test.com', name: 'User', image: null }]
    )
    mockInserts()
    mockUpdate()

    await resolveOrCreateUserFromIdentity('email', 'u@test.com', { email: 'u@test.com' })

    expect(db.transaction).toHaveBeenCalled()
  })

  it('пробрасывает ошибку transaction вместо fallback без atomicity', async () => {
    ;(db.transaction as jest.Mock).mockRejectedValueOnce(new Error('transaction failed'))
    queueSelects(
      [{ userId: 'user-uuid' }],
      [{ id: 'user-uuid', email: 'u@test.com', name: 'User', image: null }]
    )
    mockInserts()
    mockUpdate()

    await expect(resolveOrCreateUserFromIdentity('email', 'u@test.com', { email: 'u@test.com' }))
      .rejects.toThrow('transaction failed')

    expect(db.transaction).toHaveBeenCalled()
  })

  it('создаёт нового Telegram user с UUID без user.email/contactEmail', async () => {
    queueSelects(
      [],
      [{ id: 'generated-uuid', email: null, contactEmail: null, name: 'Ivan', image: null }]
    )
    const insertChains = mockInserts()
    mockUpdate()
    jest.spyOn(crypto, 'randomUUID').mockReturnValue('generated-uuid')

    const result = await resolveOrCreateUserFromIdentity('telegram-preauth', '123', {
      name: 'Ivan',
      telegramUsername: '@ivan',
    })

    expect(result.id).toBe('generated-uuid')
    expect(insertChains[0].table).toBe(users)
    expect(insertChains[0].lastValues).toEqual(expect.objectContaining({
      id: 'generated-uuid',
      contactEmail: null,
      contacts: '@ivan',
    }))
    expect(insertChains[0].lastValues).not.toHaveProperty('email')
    expect(insertChains[0].lastValues).toEqual(expect.not.objectContaining({
      authProvider: expect.anything(),
      lastSignInAt: expect.anything(),
    }))
    expect(insertChains[1].table).toBe(userActivityEvents)
    expect(insertChains[1].lastValues).toEqual(expect.objectContaining({
      userId: 'generated-uuid',
      type: 'user_created',
      occurredAt: expect.any(Date),
      source: 'auth',
      sourceId: 'telegram',
      dedupeKey: 'user_created:generated-uuid',
      metadata: JSON.stringify({ provider: 'telegram' }),
    }))
    expect(insertChains[1].onConflictDoNothing).toHaveBeenCalledWith({
      target: userActivityEvents.dedupeKey,
    })
    expect(insertChains[2].table).toBe(userIdentities)
    expect(insertChains[2].lastValues).toEqual(expect.objectContaining({
      userId: 'generated-uuid',
      provider: 'telegram',
      providerAccountId: '123',
      email: null,
      telegramUsername: 'ivan',
    }))
  })

  it('линкует trusted Google identity к существующему user by email без legacy account', async () => {
    queueSelects(
      [],
      [{ id: 'user-uuid' }],
      [{ id: 'user-uuid', email: 'user@test.com', name: 'User', image: null }]
    )
    const insertChains = mockInserts()
    const updateChain = mockUpdate()

    const result = await resolveOrCreateUserFromIdentity('google-one-tap', 'google-sub', {
      email: 'User@Test.COM',
      emailVerified: true,
      name: 'User',
    })

    expect(result.id).toBe('user-uuid')
    expect(insertChains.some(chain => chain.table === users)).toBe(false)
    expect(insertChains.some(chain => chain.table === userActivityEvents)).toBe(false)
    expect(insertChains[0].table).toBe(userIdentities)
    expect(insertChains[0].lastValues).toEqual(expect.objectContaining({
      userId: 'user-uuid',
      provider: 'google',
      providerAccountId: 'google-sub',
      email: 'user@test.com',
    }))
    expect(updateChain.set).toHaveBeenCalledWith(expect.not.objectContaining({
      authProvider: expect.anything(),
      lastSignInAt: expect.anything(),
    }))
    expect(insertChains).toHaveLength(1)
  })

  it('при существующей Google identity выбирает её владельца, а не user по email', async () => {
    queueSelects(
      [{ userId: 'identity-owner' }],
      [{ id: 'identity-owner', email: 'owner@test.com', name: 'Owner', image: null }]
    )
    const insertChains = mockInserts()
    mockUpdate()

    const result = await resolveOrCreateUserFromIdentity('google', 'google-sub', {
      email: 'other@test.com',
      emailVerified: true,
      name: 'Other',
    })

    expect(result.id).toBe('identity-owner')
    expect(insertChains.some(chain => chain.table === users)).toBe(false)
    expect(insertChains.some(chain => chain.table === userActivityEvents)).toBe(false)
    expect(insertChains[0].table).toBe(userIdentities)
    expect(insertChains[0].lastValues).toEqual(expect.objectContaining({
      userId: 'identity-owner',
      provider: 'google',
      providerAccountId: 'google-sub',
    }))
  })

  it('linkIdentityToUser upsert-ит Google identity для canonical Auth.js user id', async () => {
    queueSelects(
      [],
      [{ id: 'canonical-uuid', email: 'oauth@test.com', name: 'OAuth', image: null }]
    )
    const insertChains = mockInserts()
    mockUpdate()

    await linkIdentityToUser('canonical-uuid', 'google', 'oauth-sub', {
      email: 'oauth@test.com',
      emailVerified: true,
    })

    expect(insertChains[0].table).toBe(userIdentities)
    expect(insertChains[0].lastValues).toEqual(expect.objectContaining({
      userId: 'canonical-uuid',
      provider: 'google',
      providerAccountId: 'oauth-sub',
    }))
    expect(insertChains).toHaveLength(1)
  })

  it('linkIdentityToUser падает при попытке привязать identity другого пользователя', async () => {
    queueSelects(
      [{ userId: 'other-user' }]
    )
    const insertChains = mockInserts()

    await expect(linkIdentityToUser('canonical-uuid', 'google', 'oauth-sub', {
      email: 'oauth@test.com',
      emailVerified: true,
    })).rejects.toThrow(IdentityConflictError)

    expect(insertChains).toHaveLength(0)
    expect(db.update).not.toHaveBeenCalled()
  })

})
