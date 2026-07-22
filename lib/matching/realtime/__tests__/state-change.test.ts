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
    innerJoin: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    limit: jest.fn().mockResolvedValue(rows),
  }
}

describe('broadcastActiveMatchingStateChangeForParticipant', () => {
  beforeEach(() => jest.clearAllMocks())

  it('returns null when the user has no membership in any eligible session', async () => {
    const query = selectLimitRows([])
    mockSelect.mockReturnValueOnce(query)

    const result = await broadcastActiveMatchingStateChangeForParticipant('user-1')

    expect(result).toBeNull()
    expect(mockBump).not.toHaveBeenCalled()
    expect(query.innerJoin).toHaveBeenCalledTimes(1)
  })

  it('bumps state_version for the current or latest historical session joined by the participant', async () => {
    mockSelect.mockReturnValueOnce(selectLimitRows([{ id: 'session-1' }]))

    const result = await broadcastActiveMatchingStateChangeForParticipant('user-1')

    expect(result).toBe('session-1')
    expect(mockBump).toHaveBeenCalledWith('session-1')
  })
})
