/**
 * @jest-environment node
 */
import { bumpSessionState, getSessionState } from '../version'

jest.mock('@/lib/db', () => ({
  db: {},
}))

const updateChain = { set: jest.fn().mockReturnThis(), where: jest.fn().mockResolvedValue(undefined) }
const selectChain = {
  from: jest.fn().mockReturnThis(),
  where: jest.fn().mockReturnThis(),
  limit: jest.fn().mockResolvedValue([{ version: 5, status: 'active' }]),
}
const mockDb = {
  update: jest.fn(() => updateChain),
  select: jest.fn(() => selectChain),
} as unknown as typeof import('@/lib/db').db

jest.mock('@/lib/db/schema', () => ({ matchingSessions: { id: 'id', stateVersion: 'state_version', status: 'status' } }))

describe('matching realtime version helper', () => {
  beforeEach(() => jest.clearAllMocks())

  it('bumpSessionState issues a single update on the session row', async () => {
    await bumpSessionState('session-1', mockDb)
    expect(mockDb.update).toHaveBeenCalledTimes(1)
    expect(updateChain.set).toHaveBeenCalledTimes(1)
    expect(updateChain.where).toHaveBeenCalledTimes(1)
  })

  it('getSessionState returns version and status', async () => {
    const state = await getSessionState('session-1', mockDb)
    expect(state).toEqual({ version: 5, status: 'active' })
  })

  it('getSessionState returns null for missing session', async () => {
    selectChain.limit.mockResolvedValueOnce([])
    const state = await getSessionState('nope', mockDb)
    expect(state).toBeNull()
  })
})
