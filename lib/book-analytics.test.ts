import {
  trackCalendarSlotsMarked,
  trackCircleMeetingScheduled,
  trackPrioritiesUpdated,
} from '@/lib/book-analytics'
import { captureServerEvent } from '@/lib/posthog-server'

jest.mock('@/lib/posthog-server', () => ({
  captureServerEvent: jest.fn().mockResolvedValue(undefined),
}))

const captureMock = captureServerEvent as jest.MockedFunction<typeof captureServerEvent>

describe('book analytics', () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it('reports priorities_updated with the user as distinctId and the list size', async () => {
    await trackPrioritiesUpdated('user-1', 3)
    expect(captureMock).toHaveBeenCalledWith('user-1', 'priorities_updated', { count: 3 })
  })

  it('reports calendar_slots_marked with the number of marked intervals', async () => {
    await trackCalendarSlotsMarked('user-1', 5)
    expect(captureMock).toHaveBeenCalledWith('user-1', 'calendar_slots_marked', {
      slot_count: 5,
      circle_id: null,
    })
  })

  it('reports calendar_slots_marked with a circle id when the caller has one', async () => {
    await trackCalendarSlotsMarked('user-1', 2, 'circle-9')
    expect(captureMock).toHaveBeenCalledWith('user-1', 'calendar_slots_marked', {
      slot_count: 2,
      circle_id: 'circle-9',
    })
  })

  it('reports circle_meeting_scheduled with the circle and how many participants had marked', async () => {
    await trackCircleMeetingScheduled('user-1', 'schedule-1', 3)
    expect(captureMock).toHaveBeenCalledWith('user-1', 'circle_meeting_scheduled', {
      circle_id: 'schedule-1',
      marked_participants_count: 3,
    })
  })

  it('reports circle_meeting_scheduled without a marked-count when the caller has none', async () => {
    await trackCircleMeetingScheduled('user-1', 'schedule-1')
    expect(captureMock).toHaveBeenCalledWith('user-1', 'circle_meeting_scheduled', {
      circle_id: 'schedule-1',
      marked_participants_count: null,
    })
  })

  it('never lets a captureServerEvent failure propagate to the caller', async () => {
    captureMock.mockRejectedValueOnce(new Error('posthog is down'))
    await expect(trackPrioritiesUpdated('user-1', 1)).resolves.toBeUndefined()

    captureMock.mockRejectedValueOnce(new Error('posthog is down'))
    await expect(trackCalendarSlotsMarked('user-1', 1)).resolves.toBeUndefined()

    captureMock.mockRejectedValueOnce(new Error('posthog is down'))
    await expect(trackCircleMeetingScheduled('user-1', 'schedule-1')).resolves.toBeUndefined()
  })
})
