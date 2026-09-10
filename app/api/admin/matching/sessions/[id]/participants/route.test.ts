/**
 * @jest-environment node
 */
import { NextRequest } from 'next/server'
import { GET, POST } from './route'
import * as authModule from '@/lib/auth'
import { db } from '@/lib/db'
import { runMatchingTransition } from '@/lib/matching/session-transition-db'
import { MatchingTransitionError } from '@/lib/matching/session-transition'
import { fetchOnlineParticipantRefs } from '@/lib/matching/presence'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/db', () => ({ db: { select: jest.fn() } }))
jest.mock('@/lib/matching/session-transition-db', () => ({ runMatchingTransition: jest.fn() }))
jest.mock('@/lib/matching/presence', () => ({ fetchOnlineParticipantRefs: jest.fn() }))

const mockAuth = authModule.auth as jest.Mock
const mockDb = db as unknown as { select: jest.Mock }
const mockRunTransition = runMatchingTransition as jest.Mock
const mockOnline = fetchOnlineParticipantRefs as jest.Mock

const params = { params: { id: 'session-1' } }

function participantsSelect(rows: unknown[]) {
  const chain: Record<string, unknown> = {
    from: () => chain,
    leftJoin: () => chain,
    where: () => chain,
    orderBy: () => Promise.resolve(rows),
  }
  return chain
}

function lockedSelect(rows: unknown[]) {
  const chain: Record<string, unknown> = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => Promise.resolve(rows),
  }
  return chain
}

function bookChoicesSelect(rows: unknown[]) {
  const chain: Record<string, unknown> = {
    from: () => chain,
    innerJoin: () => chain,
    where: () => Promise.resolve(rows),
  }
  return chain
}

function personalListSelect(rows: unknown[]) {
  const chain: Record<string, unknown> = {
    from: () => chain,
    innerJoin: () => chain,
    leftJoin: () => chain,
    where: () => Promise.resolve(rows),
  }
  return chain
}

describe('GET /api/admin/matching/sessions/[id]/participants', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'admin-1', isAdmin: true } })
    mockOnline.mockResolvedValue(['user-1'])
  })

  it('403 без админ-сессии', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u', isAdmin: false } })
    expect((await GET(new NextRequest('http://localhost/x'), params)).status).toBe(403)
  })

  it('marks locked members as observers and returns real names', async () => {
    mockDb.select
      .mockReturnValueOnce(participantsSelect([
        { userId: 'user-1', publicRef: 'ref-1', joinSource: 'self', joinedAt: new Date(), name: 'Анна' },
        { userId: 'user-2', publicRef: 'ref-2', joinSource: 'admin', joinedAt: new Date(), name: 'Борис' },
      ]))
      .mockReturnValueOnce(lockedSelect([{ userId: 'user-2', title: 'Книга' }]))
      .mockReturnValueOnce(bookChoicesSelect([]))
      .mockReturnValueOnce(personalListSelect([]))

    const res = await GET(new NextRequest('http://localhost/x'), params)
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.data).toEqual([
      expect.objectContaining({ userId: 'user-1', name: 'Анна', joinSource: 'self', role: 'active' }),
      expect.objectContaining({ userId: 'user-2', name: 'Борис', joinSource: 'admin', role: 'observer' }),
    ])
    expect(body.online).toEqual(['user-1'])
  })

  it('returns each participant’s hard, conditional, and assigned book titles', async () => {
    mockDb.select
      .mockReturnValueOnce(participantsSelect([
        { userId: 'user-1', publicRef: 'ref-1', joinSource: 'self', joinedAt: new Date(), name: 'Анна' },
      ]))
      .mockReturnValueOnce(bookChoicesSelect([
        { userId: 'user-1', title: 'Над пропастью во ржи' },
      ]))
      .mockReturnValueOnce(bookChoicesSelect([
        { userId: 'user-1', kind: 'hard', title: 'Моби Дик' },
        { userId: 'user-1', kind: 'conditional', title: 'Сто лет одиночества' },
      ]))
      .mockReturnValueOnce(personalListSelect([]))

    const res = await GET(new NextRequest('http://localhost/x'), params)
    const body = await res.json()

    expect(body.data).toEqual([
      expect.objectContaining({
        userId: 'user-1',
        role: 'observer',
        choices: {
          hard: ['Моби Дик'],
          conditional: ['Сто лет одиночества'],
          assigned: ['Над пропастью во ржи'],
        },
      }),
    ])
  })

  it('returns the full ranked wishlist and current reading books of each participant', async () => {
    mockDb.select
      .mockReturnValueOnce(participantsSelect([
        { userId: 'user-1', publicRef: 'ref-1', joinSource: 'self', joinedAt: new Date(), name: 'Анна' },
        { userId: 'user-2', publicRef: 'ref-2', joinSource: 'self', joinedAt: new Date(), name: 'Борис' },
      ]))
      .mockReturnValueOnce(lockedSelect([]))
      .mockReturnValueOnce(bookChoicesSelect([]))
      .mockReturnValueOnce(personalListSelect([
        { userId: 'user-1', title: 'Третья', personalStatus: null, rank: 3 },
        { userId: 'user-1', title: 'Без ранга', personalStatus: null, rank: null },
        { userId: 'user-1', title: 'Первая', personalStatus: null, rank: 1 },
        { userId: 'user-1', title: 'Уроки химии', personalStatus: 'reading', rank: null },
      ]))

    const body = await (await GET(new NextRequest('http://localhost/x'), params)).json()

    expect(body.data[0].wishlist).toEqual([
      { title: 'Первая', rank: 1 },
      { title: 'Третья', rank: 3 },
      { title: 'Без ранга', rank: null },
    ])
    expect(body.data[0].readingNow).toEqual(['Уроки химии'])
    expect(body.data[1]).toMatchObject({ wishlist: [], readingNow: [] })
  })
})

describe('POST /api/admin/matching/sessions/[id]/participants', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockAuth.mockResolvedValue({ user: { id: 'admin-1', name: 'Админ', contactEmail: null, isAdmin: true } })
    mockRunTransition.mockResolvedValue({ changed: true, stateVersion: 2 })
  })

  function makeReq(body: object) {
    return new NextRequest('http://localhost/api/admin/matching/sessions/session-1/participants', {
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    })
  }

  it('403 без админ-сессии', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'u', isAdmin: false } })
    expect((await POST(makeReq({ userId: 'user-1' }), params)).status).toBe(403)
  })

  it('requires a userId', async () => {
    const res = await POST(makeReq({}), params)
    expect(res.status).toBe(400)
    expect(mockRunTransition).not.toHaveBeenCalled()
  })

  it('adds the participant through the transition service with admin source', async () => {
    const res = await POST(makeReq({ userId: 'user-1' }), params)
    expect(res.status).toBe(201)
    expect(mockRunTransition).toHaveBeenCalledWith({
      sessionId: 'session-1',
      actor: { userId: 'admin-1', label: 'Админ', source: 'admin' },
      action: { type: 'admin_add', userId: 'user-1' },
    })
  })

  it('maps a non-active session to 409', async () => {
    mockRunTransition.mockRejectedValue(new MatchingTransitionError('session_closed'))
    expect((await POST(makeReq({ userId: 'user-1' }), params)).status).toBe(409)
  })
})
