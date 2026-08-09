import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import CalendarClient from './CalendarClient'
import type { CalendarPublicState } from '@/lib/calendar/public-state'

function response(body: unknown, ok = true): Response {
  return { ok, json: () => Promise.resolve(body) } as Response
}

function makeState(intervals: CalendarPublicState['participants'][number]['intervals'] = []): CalendarPublicState {
  return {
    slug: 'dolg-pervye-5000-let-istorii',
    book: { title: 'Долг: первые 5000 лет истории', author: 'Дэвид Гребер' },
    position: 1,
    circleExists: true,
    durationMinutes: 90,
    window: { start: '2026-08-09T00:00:00.000Z', end: '2026-09-06T00:00:00.000Z' },
    now: '2026-08-09T09:00:00.000Z',
    participants: [{
      ref: 'viewer',
      displayName: 'Евгений Кошкин',
      timezone: 'Europe/Belgrade',
      timezoneConfirmed: true,
      marked: intervals.length > 0,
      intervals,
      busy: [],
    }],
    meetings: [],
    viewer: {
      ref: 'viewer',
      canEdit: true,
      isAdmin: false,
      actingAsRef: 'viewer',
      timezone: 'Europe/Belgrade',
      timezoneConfirmed: true,
    },
    migrationRequired: false,
  }
}

describe('CalendarClient', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    global.fetch = jest.fn()
  })

  afterEach(() => {
    jest.useRealTimers()
    jest.restoreAllMocks()
  })

  it('does not autosave again after applying the server state returned by reload', async () => {
    const slot = '2026-08-11T11:00:00.000Z'
    const savedIntervals = [{ startsAt: slot, endsAt: '2026-08-11T11:30:00.000Z' }]
    ;(global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/api/calendar/availability')) return Promise.resolve(response({ ok: true, intervals: savedIntervals }))
      return Promise.resolve(response(makeState(savedIntervals)))
    })

    render(<CalendarClient initialState={makeState()} />)

    const cell = screen.getByRole('button', { name: '11 авг. 11:00' })
    fireEvent.pointerDown(cell, { pointerType: 'mouse' })
    fireEvent.pointerUp(cell)

    await act(async () => { await jest.advanceTimersByTimeAsync(400) })
    await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2))

    await act(async () => { await jest.advanceTimersByTimeAsync(400) })

    const availabilitySaves = (global.fetch as jest.Mock).mock.calls.filter(([url, init]) => (
      String(url).includes('/api/calendar/availability') && init?.method === 'PUT'
    ))
    expect(availabilitySaves).toHaveLength(1)
  })

  it('marks the full meeting duration on a single cell click without opening the popover', async () => {
    const slot = '2026-08-11T11:00:00.000Z'
    ;(global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/api/calendar/availability')) return Promise.resolve(response({ ok: true, intervals: [] }))
      return Promise.resolve(response(makeState()))
    })

    render(<CalendarClient initialState={makeState()} />)

    const cell = screen.getByRole('button', { name: '11 авг. 11:00' })
    fireEvent.pointerDown(cell, { pointerType: 'mouse' })
    fireEvent.pointerUp(cell)

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await act(async () => { await jest.advanceTimersByTimeAsync(400) })

    const save = (global.fetch as jest.Mock).mock.calls.find(([url, init]) => (
      String(url).includes('/api/calendar/availability') && init?.method === 'PUT'
    ))
    expect(JSON.parse(save[1].body)).toEqual({
      intervals: [{ startsAt: slot, endsAt: '2026-08-11T12:30:00.000Z' }],
    })
  })

  it('shows editable meeting duration without the circle number and saves changes', async () => {
    ;(global.fetch as jest.Mock).mockImplementation((url: string, init?: RequestInit) => {
      if (init?.method === 'PATCH') return Promise.resolve(response({ ok: true, slug: 'dolg-pervye-5000-let-istorii' }))
      return Promise.resolve(response({ ...makeState(), durationMinutes: 60 }))
    })

    render(<CalendarClient initialState={makeState()} />)

    expect(screen.queryByText(/Круг 1/i)).not.toBeInTheDocument()
    const select = screen.getByLabelText('Длительность встречи')
    await act(async () => {
      fireEvent.change(select, { target: { value: '60' } })
    })

    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/calendar/dolg-pervye-5000-let-istorii', expect.objectContaining({
      method: 'PATCH',
      body: JSON.stringify({ durationMinutes: 60 }),
    })))
  })

  it('uses UTC offsets in the participant list and readable overlap legend copy', () => {
    render(<CalendarClient initialState={makeState([{ startsAt: '2026-08-11T11:00:00.000Z', endsAt: '2026-08-11T12:30:00.000Z' }])} />)

    expect(screen.getByText('UTC+2')).toBeInTheDocument()
    expect(screen.getByText('Чем больше участников свободны, тем темнее клетка')).toBeInTheDocument()
    expect(screen.queryByText(/1 →/)).not.toBeInTheDocument()
  })
})
