/**
 * @jest-environment node
 */

jest.mock('@/lib/db', () => ({
  db: {
    select: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
  },
}))

import { db } from '@/lib/db'
import { accounts, userActivityEvents, userIdentities, users } from '@/lib/db/schema'
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
    delete (db as unknown as { transaction?: unknown }).transaction
  })

  it('нормализует provider aliases и Telegram contact', () => {
    expect(normalizeIdentityProvider('google-one-tap')).toBe('google')
    expect(normalizeIdentityProvider('resend')).toBe('email')
    expect(normalizeIdentityProvider('telegram-preauth')).toBe('telegram')
    expect(normalizeTelegramContact(' @reader ')).toBe('reader')
    expect(normalizeTelegramContact('')).toBeNull()
  })

  it('использует transaction если DB client её поддерживает', async () => {
    ;(db as unknown as { transaction: jest.Mock }).transaction = jest.fn(async (callback) => callback(db))
    queueSelects(
      [{ userId: 'user-uuid' }],
      [{ id: 'user-uuid', email: 'u@test.com', name: 'User', image: null }]
    )
    mockInserts()
    mockUpdate()

    await resolveOrCreateUserFromIdentity('email', 'u@test.com', { email: 'u@test.com' })

    expect((db as unknown as { transaction: jest.Mock }).transaction).toHaveBeenCalled()
  })

  it('откатывается на обычные запросы если neon-http объявляет transaction, но не поддерживает её', async () => {
    ;(db as unknown as { transaction: jest.Mock }).transaction = jest.fn(async () => {
      throw new Error('No transactions support in neon-http driver')
    })
    queueSelects(
      [{ userId: 'user-uuid' }],
      [{ id: 'user-uuid', email: 'u@test.com', name: 'User', image: null }]
    )
    mockInserts()
    mockUpdate()

    const result = await resolveOrCreateUserFromIdentity('email', 'u@test.com', { email: 'u@test.com' })

    expect(result.id).toBe('user-uuid')
    expect((db as unknown as { transaction: jest.Mock }).transaction).toHaveBeenCalled()
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

  it('линкует trusted Google identity к существующему user by email и синхронизирует account', async () => {
    queueSelects(
      [],
      [],
      [{ id: 'user-uuid' }],
      [],
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
    expect(insertChains[1].table).toBe(accounts)
    expect(insertChains[1].lastValues).toEqual(expect.objectContaining({
      userId: 'user-uuid',
      provider: 'google',
      providerAccountId: 'google-sub',
    }))
  })

  it('при существующем Google account выбирает владельца account, а не user по email', async () => {
    queueSelects(
      [],
      [{ userId: 'account-owner' }],
      [{ userId: 'account-owner' }],
      [{ id: 'account-owner', email: 'owner@test.com', name: 'Owner', image: null }]
    )
    const insertChains = mockInserts()
    mockUpdate()

    const result = await resolveOrCreateUserFromIdentity('google', 'google-sub', {
      email: 'other@test.com',
      emailVerified: true,
      name: 'Other',
    })

    expect(result.id).toBe('account-owner')
    expect(insertChains.some(chain => chain.table === users)).toBe(false)
    expect(insertChains.some(chain => chain.table === userActivityEvents)).toBe(false)
    expect(insertChains[0].table).toBe(userIdentities)
    expect(insertChains[0].lastValues).toEqual(expect.objectContaining({
      userId: 'account-owner',
      provider: 'google',
      providerAccountId: 'google-sub',
    }))
  })

  it('linkIdentityToUser upsert-ит Google identity для canonical Auth.js user id', async () => {
    queueSelects(
      [],
      [],
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
    expect(insertChains[1].table).toBe(accounts)
    expect(insertChains[1].onConflictDoNothing).toHaveBeenCalledWith({
      target: [accounts.provider, accounts.providerAccountId],
    })
  })

  it('linkIdentityToUser падает при попытке привязать identity другого пользователя', async () => {
    queueSelects(
      [],
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

  it('linkIdentityToUser не переносит существующий Google account на другого пользователя', async () => {
    queueSelects(
      [{ userId: 'other-user' }]
    )
    const insertChains = mockInserts()
    mockUpdate()

    await expect(linkIdentityToUser('canonical-uuid', 'google', 'oauth-sub', {
      email: 'oauth@test.com',
      emailVerified: true,
    })).rejects.toThrow(IdentityConflictError)

    expect(insertChains).toHaveLength(0)
    expect(insertChains.some(chain => chain.table === accounts)).toBe(false)
  })
})
