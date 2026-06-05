/**
 * @jest-environment node
 */
import { db } from '@/lib/db'
import { bumpSessionState } from '../version'
import { broadcastActiveMatchingStateChangeForParticipant } from '../state-change'

jest.mock('@/lib/db', () => ({
  db: { select: jest.fn() },
}))
jest.mock('@/lib/db/schema', () => ({
  matchingSessions: {},
  matchingSessionParticipants: {},
}))
jest.mock('../version', () => ({ bumpSessionState: jest.fn() }))

const mockSelect = db.select as jest.Mock
const mockBump = bumpSessionState as jest.Mock

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

    const result = await broadcastActiveMatchingStateChangeForParticipant('user-1')

    expect(result).toBeNull()
    expect(mockBump).not.toHaveBeenCalled()
  })

  it('does nothing when the user is not a participant', async () => {
    mockSelect
      .mockReturnValueOnce(selectLimitRows([{ id: 'session-1' }]))
      .mockReturnValueOnce(selectLimitRows([]))

    const result = await broadcastActiveMatchingStateChangeForParticipant('user-1')

    expect(result).toBeNull()
    expect(mockBump).not.toHaveBeenCalled()
  })

  it('bumps state_version for active session participants', async () => {
    mockSelect
      .mockReturnValueOnce(selectLimitRows([{ id: 'session-1' }]))
      .mockReturnValueOnce(selectLimitRows([{ userId: 'user-1' }]))

    const result = await broadcastActiveMatchingStateChangeForParticipant('user-1')

    expect(result).toBe('session-1')
    expect(mockBump).toHaveBeenCalledWith('session-1')
  })
})
