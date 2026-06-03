/**
 * @jest-environment node
 */
import { db } from '@/lib/db'
import { broadcast } from '../hub'
import { broadcastActiveMatchingStateChangeForParticipant } from '../state-change'

jest.mock('@/lib/db', () => ({
  db: { select: jest.fn() },
}))
jest.mock('@/lib/db/schema', () => ({
  matchingSessions: {},
  matchingSessionParticipants: {},
}))
jest.mock('../hub', () => ({ broadcast: jest.fn() }))

const mockSelect = db.select as jest.Mock
const mockBroadcast = broadcast as jest.Mock

function selectLimitRows(rows: unknown[]) {
  return {
    from: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(rows),
  }
}

describe('broadcastActiveMatchingStateChangeForParticipant', () => {
  beforeEach(() => jest.clearAllMocks())

  it('does nothing when there is no active matching session', async () => {
    mockSelect.mockReturnValueOnce(selectLimitRows([]))

    const result = await broadcastActiveMatchingStateChangeForParticipant('user-1', { kind: 'updated' })

    expect(result).toBeNull()
    expect(mockBroadcast).not.toHaveBeenCalled()
  })

  it('does nothing when the user is not a participant', async () => {
    mockSelect
      .mockReturnValueOnce(selectLimitRows([{ id: 'session-1' }]))
      .mockReturnValueOnce(selectLimitRows([]))

    const result = await broadcastActiveMatchingStateChangeForParticipant('user-1', { kind: 'updated' })

    expect(result).toBeNull()
    expect(mockBroadcast).not.toHaveBeenCalled()
  })

  it('broadcasts state_changed for active session participants', async () => {
    mockSelect
      .mockReturnValueOnce(selectLimitRows([{ id: 'session-1' }]))
      .mockReturnValueOnce(selectLimitRows([{ userId: 'user-1' }]))

    const result = await broadcastActiveMatchingStateChangeForParticipant('user-1', {
      kind: 'updated',
      bookId: 'book-1',
    })

    expect(result).toBe('session-1')
    expect(mockBroadcast).toHaveBeenCalledWith('session-1', 'state_changed', {
      userId: 'user-1',
      kind: 'updated',
      bookId: 'book-1',
    })
  })
})
