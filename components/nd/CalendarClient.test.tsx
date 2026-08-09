import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import CalendarClient from './CalendarClient'
import type { CalendarPublicState } from '@/lib/calendar/public-state'
import { detectBrowserTimeZone } from '@/lib/calendar/timezone'

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

function makeAdminState(): CalendarPublicState {
  const myIntervals = [{ startsAt: '2026-08-11T12:00:00.000Z', endsAt: '2026-08-11T13:30:00.000Z' }]
  return {
    ...makeState(myIntervals),
    participants: [
      {
        ref: 'vova',
        adminUserId: 'user-vova',
        displayName: 'Vova',
        timezone: 'Europe/Belgrade',
        timezoneConfirmed: true,
        marked: false,
        intervals: [],
        busy: [],
      },
      {
        ref: 'viewer',
        adminUserId: 'admin-user',
        displayName: 'Евгений Кошкин',
        timezone: 'Europe/Belgrade',
        timezoneConfirmed: true,
        marked: true,
        intervals: myIntervals,
        busy: [],
      },
    ],
    viewer: {
      ref: 'viewer',
      canEdit: true,
      isAdmin: true,
      actingAsRef: 'viewer',
      timezone: 'Europe/Belgrade',
      timezoneConfirmed: true,
    },
  }
}

function makeActingAdminState(): CalendarPublicState {
  return {
    ...makeAdminState(),
    participants: [
      {
        ref: 'vova',
        adminUserId: 'user-vova',
        displayName: 'Vova',
        timezone: 'Europe/Belgrade',
        timezoneConfirmed: true,
        marked: true,
        intervals: [{ startsAt: '2026-08-11T15:00:00.000Z', endsAt: '2026-08-11T16:00:00.000Z' }],
        busy: [],
      },
      {
        ref: 'viewer',
        adminUserId: 'admin-user',
        displayName: 'Евгений Кошкин',
        timezone: 'Europe/Belgrade',
        timezoneConfirmed: true,
        marked: true,
        intervals: [{ startsAt: '2026-08-11T12:00:00.000Z', endsAt: '2026-08-11T13:30:00.000Z' }],
        busy: [],
      },
    ],
    viewer: {
      ref: 'viewer',
      canEdit: true,
      isAdmin: true,
      actingAsRef: 'vova',
      timezone: 'Europe/Belgrade',
      timezoneConfirmed: true,
    },
  }
}

// Круг из четырёх, как на проде: двое отметились, двое не заходили.
function makeCircleState(): CalendarPublicState {
  const shared = [{ startsAt: '2026-08-11T12:00:00.000Z', endsAt: '2026-08-11T13:00:00.000Z' }]
  const person = (ref: string, displayName: string, intervals: { startsAt: string; endsAt: string }[]) => ({
    ref,
    displayName,
    timezone: 'Europe/Belgrade',
    timezoneConfirmed: true,
    marked: intervals.length > 0,
    intervals,
    busy: [],
  })
  return {
    ...makeState(shared),
    durationMinutes: 60,
    participants: [
      person('viewer', 'Евгений Кошкин', shared),
      person('vova', 'Vova', shared),
      person('julia', 'Julia M', []),
      person('nick', 'Псевдоним', []),
    ],
  }
}

jest.mock('@/lib/calendar/timezone', () => ({
  ...jest.requireActual('@/lib/calendar/timezone'),
  detectBrowserTimeZone: jest.fn(),
}))

const mockDetect = detectBrowserTimeZone as jest.MockedFunction<typeof detectBrowserTimeZone>

/** Анонимный посетитель по публичной ссылке: своего пояса в профиле нет. */
function makeAnonymousState(): CalendarPublicState {
  const base = makeCircleState()
  return {
    ...base,
    viewer: { ref: null, canEdit: false, isAdmin: false, actingAsRef: null, timezone: null, timezoneConfirmed: false },
  }
}

describe('CalendarClient', () => {
  beforeEach(() => {
    jest.useFakeTimers()
    global.fetch = jest.fn()
    mockDetect.mockReturnValue('Europe/Belgrade')
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: jest.fn().mockImplementation((query: string) => ({
        matches: query.includes('hover: hover'),
        media: query,
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
      })),
    })
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

    const cell = screen.getByRole('button', { name: '11 авг. 13:00' })
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

    const cell = screen.getByRole('button', { name: '11 авг. 13:00' })
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

  it('removes the whole meeting-duration block when clicking any cell inside it', async () => {
    const interval = { startsAt: '2026-08-11T11:00:00.000Z', endsAt: '2026-08-11T12:30:00.000Z' }
    ;(global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/api/calendar/availability')) return Promise.resolve(response({ ok: true, intervals: [] }))
      return Promise.resolve(response(makeState()))
    })

    render(<CalendarClient initialState={makeState([interval])} />)

    const lastCell = screen.getByRole('button', { name: '11 авг. 14:00' })
    fireEvent.pointerDown(lastCell, { pointerType: 'mouse' })
    fireEvent.pointerUp(lastCell)

    await act(async () => { await jest.advanceTimersByTimeAsync(400) })

    const save = (global.fetch as jest.Mock).mock.calls.find(([url, init]) => (
      String(url).includes('/api/calendar/availability') && init?.method === 'PUT'
    ))
    expect(JSON.parse(save[1].body)).toEqual({ intervals: [] })
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

  it('shows one personal marker for a continuous availability block', () => {
    const { container } = render(<CalendarClient initialState={makeState([{ startsAt: '2026-08-11T11:00:00.000Z', endsAt: '2026-08-11T12:30:00.000Z' }])} />)

    expect(container.querySelectorAll('[data-mine-marker="true"]')).toHaveLength(1)
  })

  it('does not show the editor marker while previewing another participant', () => {
    const { container } = render(<CalendarClient initialState={makeAdminState()} />)

    fireEvent.mouseEnter(screen.getByRole('button', { name: /Vova/i }))

    expect(container.querySelectorAll('[data-mine-marker="true"]')).toHaveLength(0)
  })

  it('opens an admin acting link when clicking a participant on desktop', () => {
    const originalLocation = window.location
    const assign = jest.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, assign },
    })

    render(<CalendarClient initialState={makeAdminState()} />)

    fireEvent.click(screen.getByRole('button', { name: /Vova/i }))

    expect(assign).toHaveBeenCalledWith('/calendar/dolg-pervye-5000-let-istorii?as=user-vova')
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
  })

  it('uses participant clicks for preview on touch devices', () => {
    ;(window.matchMedia as jest.Mock).mockImplementation((query: string) => ({
      matches: !query.includes('hover: hover'),
      media: query,
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
    }))
    const originalLocation = window.location
    const assign = jest.fn()
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...originalLocation, assign },
    })
    const { container } = render(<CalendarClient initialState={makeAdminState()} />)

    fireEvent.click(screen.getByRole('button', { name: /Vova/i }))

    expect(screen.getByText('Нажмите на имя, чтобы увидеть только его время')).toBeInTheDocument()
    expect(container.querySelectorAll('[data-mine-marker="true"]')).toHaveLength(0)
    expect(assign).not.toHaveBeenCalled()
    Object.defineProperty(window, 'location', { configurable: true, value: originalLocation })
  })

  it('показывает чужие отметки тепловой картой в админском режиме, без наведения', () => {
    render(<CalendarClient initialState={makeActingAdminState()} actingUserId="user-vova" />)

    // Время того, за кого действуем.
    expect(screen.getByRole('button', { name: '11 авг. 17:00' })).toHaveAttribute('data-tone', 'partial')
    // Время другого участника обязано быть видно сразу — из-за #547 оно пропадало.
    expect(screen.getByRole('button', { name: '11 авг. 14:00' })).toHaveAttribute('data-tone', 'partial')
  })

  it('фильтрует сетку по участнику только после явного наведения', () => {
    render(<CalendarClient initialState={makeActingAdminState()} actingUserId="user-vova" />)

    fireEvent.mouseEnter(screen.getByRole('button', { name: /Евгений Кошкин/ }))

    expect(screen.getByRole('button', { name: '11 авг. 14:00' })).toHaveAttribute('data-tone', 'focus')
    expect(screen.getByRole('button', { name: '11 авг. 17:00' })).toHaveAttribute('data-tone', 'none')
  })

  it('тёмный тон покрывает всю длительность встречи, а не только её начало', () => {
    render(<CalendarClient initialState={makeCircleState()} />)

    // Пересечение 14:00–15:00 по Белграду при длительности 60 минут — обе клетки.
    expect(screen.getByRole('button', { name: '11 авг. 14:00' })).toHaveAttribute('data-tone', 'full')
    expect(screen.getByRole('button', { name: '11 авг. 14:30' })).toHaveAttribute('data-tone', 'full')
  })

  it('считает шкалу от отметившихся, а не от размера круга', () => {
    render(<CalendarClient initialState={makeCircleState()} />)

    const cell = screen.getByRole('button', { name: '11 авг. 14:00' })
    // Двое не заходивших в знаменатель не попадают, иначе шкала никогда не дойдёт до максимума.
    expect(cell).toHaveAttribute('data-marked', '2')
    expect(cell).toHaveAttribute('data-free', '2')
  })

  it('подписывает сетку в поясе смотрящего, а не в UTC', () => {
    render(<CalendarClient initialState={makeCircleState()} />)

    // 12:00Z в Белграде — это 14:00.
    expect(screen.getByRole('button', { name: '11 авг. 14:00' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '11 авг. 12:00' })).not.toBeInTheDocument()
  })

  it('не теряет клики, сделанные пока летит сохранение', async () => {
    let releaseSave: (() => void) | null = null
    const firstBlockOnly = [{ startsAt: '2026-08-11T11:00:00.000Z', endsAt: '2026-08-11T12:30:00.000Z' }]
    ;(global.fetch as jest.Mock).mockImplementation((url: string, init?: RequestInit) => {
      if (String(url).includes('/api/calendar/availability') && init?.method === 'PUT') {
        return new Promise((resolve) => { releaseSave = () => resolve(response({ ok: true })) })
      }
      // Перечитанное состояние знает только про первый блок — второй кликнули позже.
      return Promise.resolve(response(makeState(firstBlockOnly)))
    })

    render(<CalendarClient initialState={makeState()} />)

    const first = screen.getByRole('button', { name: '11 авг. 13:00' })
    fireEvent.pointerDown(first, { pointerType: 'mouse' })
    fireEvent.pointerUp(first)
    await act(async () => { await jest.advanceTimersByTimeAsync(400) })

    // Пока запрос в полёте, пользователь отмечает ещё один слот.
    const second = screen.getByRole('button', { name: '11 авг. 16:00' })
    fireEvent.pointerDown(second, { pointerType: 'mouse' })
    fireEvent.pointerUp(second)

    await act(async () => { releaseSave?.(); await jest.advanceTimersByTimeAsync(0) })
    await act(async () => { await jest.advanceTimersByTimeAsync(400) })

    const saves = (global.fetch as jest.Mock).mock.calls.filter(([url, init]) => (
      String(url).includes('/api/calendar/availability') && init?.method === 'PUT'
    ))
    const lastBody = JSON.parse(saves.at(-1)![1].body)
    expect(lastBody.intervals).toHaveLength(2)
    expect(lastBody.intervals.map((i: { startsAt: string }) => i.startsAt)).toContain('2026-08-11T14:00:00.000Z')
    // И второй блок не должен пропасть с экрана.
    expect(screen.getByRole('button', { name: '11 авг. 16:00' })).toHaveAttribute('data-free', '1')
  })

  it('анонимному посетителю рисует сетку в поясе его браузера, а не в UTC', async () => {
    mockDetect.mockReturnValue('Asia/Tbilisi')
    ;(global.fetch as jest.Mock).mockResolvedValue(response({}))

    await act(async () => { render(<CalendarClient initialState={makeAnonymousState()} />) })

    // 12:00Z в Тбилиси — 16:00. До починки подпись оставалась серверной, UTC.
    const cell = document.querySelector('[data-cell="2026-08-11T12:00:00.000Z"]')
    expect(cell).toHaveAttribute('aria-label', '11 авг. 16:00')
  })

  it('анонимному показывает выбор пояса, но ничего не сохраняет в профиль', async () => {
    ;(global.fetch as jest.Mock).mockResolvedValue(response({}))

    await act(async () => { render(<CalendarClient initialState={makeAnonymousState()} />) })

    expect(screen.getByLabelText('Часовой пояс')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'ВЕРНО' })).not.toBeInTheDocument()

    await act(async () => {
      fireEvent.change(screen.getByLabelText('Часовой пояс'), { target: { value: 'Asia/Tbilisi' } })
    })

    expect(screen.getByRole('button', { name: '11 авг. 16:00' })).toBeInTheDocument()
    const profileCalls = (global.fetch as jest.Mock).mock.calls
      .filter(([url]) => String(url).includes('/api/profile/timezone'))
    expect(profileCalls).toHaveLength(0)
  })

  it('участнику без сохранённого пояса определяет его и записывает в профиль', async () => {
    mockDetect.mockReturnValue('Asia/Tbilisi')
    ;(global.fetch as jest.Mock).mockResolvedValue(response({}))
    const state = makeCircleState()

    await act(async () => {
      render(<CalendarClient initialState={{
        ...state,
        viewer: { ...state.viewer, timezone: null, timezoneConfirmed: false },
      }} />)
    })

    const profileCall = (global.fetch as jest.Mock).mock.calls
      .find(([url]) => String(url).includes('/api/profile/timezone'))
    expect(profileCall).toBeDefined()
    expect(JSON.parse(profileCall![1].body)).toEqual({ timezone: 'Asia/Tbilisi', confirmed: false })
    expect(screen.getByRole('button', { name: '11 авг. 16:00' })).toBeInTheDocument()
  })

  it('сохранённый пояс профиля важнее браузерного', async () => {
    mockDetect.mockReturnValue('America/New_York')
    ;(global.fetch as jest.Mock).mockResolvedValue(response({}))

    await act(async () => { render(<CalendarClient initialState={makeCircleState()} />) })

    // Профиль говорит Белград — значит 14:00, а не нью-йоркские 08:00.
    expect(screen.getByRole('button', { name: '11 авг. 14:00' })).toBeInTheDocument()
  })
})
