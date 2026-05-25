/**
 * @jest-environment node
 */
import { POST } from './route'
import * as authModule from '@/lib/auth'
import * as activityModule from '@/lib/user-activity'

jest.mock('@/lib/auth', () => ({ auth: jest.fn() }))
jest.mock('@/lib/user-activity', () => ({
  buildUserActivityDedupeKey: jest.fn(() => 'site-visit-dedupe-key'),
  bestEffortRecordUserActivity: jest.fn(),
}))

const mockAuth = authModule.auth as jest.Mock
const mockBuildDedupeKey = activityModule.buildUserActivityDedupeKey as jest.Mock
const mockRecordUserActivity = activityModule.bestEffortRecordUserActivity as jest.Mock

describe('POST /api/activity/site-visit', () => {
  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-05-25T10:30:00Z'))
    mockAuth.mockReset()
    mockBuildDedupeKey.mockClear()
    mockRecordUserActivity.mockClear()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it('возвращает 401 без сессии', async () => {
    mockAuth.mockResolvedValue(null)

    const res = await POST()

    expect(res.status).toBe(401)
    expect(mockRecordUserActivity).not.toHaveBeenCalled()
  })

  it('записывает почасовой site_visit для залогиненного пользователя', async () => {
    mockAuth.mockResolvedValue({ user: { id: 'user-1' } })

    const res = await POST()

    expect(res.status).toBe(200)
    expect(mockBuildDedupeKey).toHaveBeenCalledWith(['api', 'site_visit', 'user-1', '2026-05-25T10'])
    expect(mockRecordUserActivity).toHaveBeenCalledWith('user-1', 'site_visit', {
      occurredAt: new Date('2026-05-25T10:30:00Z'),
      source: 'api',
      sourceId: 'user-1',
      dedupeKey: 'site-visit-dedupe-key',
    })
  })
})
