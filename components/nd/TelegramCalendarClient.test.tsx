import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import TelegramCalendarClient from './TelegramCalendarClient'

const initialState = {
  slug: 'long-march-1',
  book: { title: 'Долгое наступление', author: 'Александр Анучкин' },
  position: 1,
  circleExists: true,
  durationMinutes: 60,
  window: { start: '2026-11-23T00:00:00.000Z', end: '2026-11-30T00:00:00.000Z' },
  now: '2026-11-22T10:00:00.000Z',
  participants: [
    { ref: 'me', displayName: 'Я', timezone: 'UTC', timezoneConfirmed: true, marked: false, intervals: [], busy: [] },
    { ref: 'anya', displayName: 'Аня', timezone: 'UTC', timezoneConfirmed: true, marked: true, intervals: [{ startsAt: '2026-11-23T08:00:00.000Z', endsAt: '2026-11-23T10:00:00.000Z' }], busy: [] },
  ],
  meetings: [],
  viewer: { ref: 'me', canEdit: true, isAdmin: false, actingAsRef: 'me', timezone: 'UTC', timezoneConfirmed: true },
  migrationRequired: false,
}

function response(body: unknown, status = 200) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body })
}

beforeEach(() => {
  window.Telegram = { WebApp: { initData: 'signed-init-data', ready: jest.fn(), requestFullscreen: jest.fn() } }
  global.fetch = jest.fn().mockImplementation(() => response(initialState))
})

afterEach(() => {
  delete window.Telegram
  jest.restoreAllMocks()
})

test('показывает понятную ошибку вне Telegram', () => {
  delete window.Telegram
  render(<TelegramCalendarClient slug="circle" />)
  expect(screen.getByText('Откройте календарь из Telegram.')).toBeInTheDocument()
})

test('запускает Mini App и загружает семидневную сетку с Telegram-токеном', async () => {
  render(<TelegramCalendarClient slug="long-march-1" />)

  expect(await screen.findByRole('heading', { name: 'Долгое наступление' })).toBeInTheDocument()
  expect(window.Telegram?.WebApp?.ready).toHaveBeenCalled()
  expect(window.Telegram?.WebApp?.requestFullscreen).toHaveBeenCalled()
  expect(global.fetch).toHaveBeenCalledWith('/api/tg/calendar/long-march-1', expect.objectContaining({
    headers: { Authorization: 'tma signed-init-data' },
  }))
  expect(screen.getAllByTestId('calendar-cell')).toHaveLength(196)
})

test('сохраняет выбранный полный блок длительности через scoped Telegram endpoint', async () => {
  render(<TelegramCalendarClient slug="long-march-1" />)
  const cell = await screen.findByLabelText(/23 нояб.*09:00/i)
  fireEvent.pointerDown(cell, { pointerType: 'mouse' })
  fireEvent.pointerUp(cell, { pointerType: 'mouse' })

  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
    '/api/tg/calendar/long-march-1/availability',
    expect.objectContaining({ method: 'PUT', headers: expect.objectContaining({ Authorization: 'tma signed-init-data' }) }),
  ))
  const calls = (global.fetch as jest.Mock).mock.calls
  const save = calls.find(([url, init]) => url.endsWith('/availability') && init?.method === 'PUT')
  expect(JSON.parse(save?.[1].body)).toEqual({
    intervals: [{ startsAt: '2026-11-23T09:00:00.000Z', endsAt: '2026-11-23T10:00:00.000Z' }],
  })
})

test('ставит быстрые правки в очередь, чтобы старый PUT не перезаписал новый снимок', async () => {
  let resolveFirst: ((value: unknown) => void) | undefined
  let resolveSecond: ((value: unknown) => void) | undefined
  const first = new Promise((resolve) => { resolveFirst = resolve })
  const second = new Promise((resolve) => { resolveSecond = resolve })
  let saves = 0
  ;(global.fetch as jest.Mock).mockImplementation((url: string, init?: RequestInit) => {
    if (init?.method === 'PUT') return ++saves === 1 ? first : second
    return response(initialState)
  })
  render(<TelegramCalendarClient slug="long-march-1" />)
  const firstCell = await screen.findByLabelText(/23 нояб.*09:00/i)
  const secondCell = screen.getByLabelText(/23 нояб.*10:00/i)
  fireEvent.pointerDown(firstCell, { pointerType: 'mouse' }); fireEvent.pointerUp(firstCell, { pointerType: 'mouse' })
  await waitFor(() => expect(saves).toBe(1))
  fireEvent.pointerDown(secondCell, { pointerType: 'mouse' }); fireEvent.pointerUp(secondCell, { pointerType: 'mouse' })
  await new Promise((resolve) => setTimeout(resolve, 300))
  expect(saves).toBe(1)
  resolveFirst?.({ ok: true })
  await waitFor(() => expect(saves).toBe(2))
  const saveCalls = (global.fetch as jest.Mock).mock.calls.filter(([, init]) => init?.method === 'PUT')
  expect(JSON.parse(saveCalls[1][1].body)).toEqual({
    intervals: [{ startsAt: '2026-11-23T09:00:00.000Z', endsAt: '2026-11-23T11:00:00.000Z' }],
  })
  resolveSecond?.({ ok: true })
})

test('даёт участнику назначить подходящую встречу', async () => {
  const state = {
    ...initialState,
    participants: initialState.participants.map((participant) => ({
      ...participant,
      marked: true,
      intervals: [{ startsAt: '2026-11-23T09:00:00.000Z', endsAt: '2026-11-23T11:00:00.000Z' }],
    })),
  }
  ;(global.fetch as jest.Mock).mockImplementation((url: string, init?: RequestInit) => {
    if (url.endsWith('/meetings')) return response({ ok: true, id: 'meeting-1' }, 201)
    if (!init?.method || init.method === 'GET') return response(state)
    return response({ ok: true, intervals: [] })
  })
  render(<TelegramCalendarClient slug="long-march-1" />)

  const cell = await screen.findByLabelText(/23 нояб.*09:00/i)
  fireEvent.pointerDown(cell, { pointerType: 'mouse' })
  fireEvent.pointerUp(cell, { pointerType: 'mouse' })
  fireEvent.click(await screen.findByRole('button', { name: 'Назначить встречу' }))

  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
    '/api/tg/calendar/long-march-1/meetings',
    expect.objectContaining({ method: 'POST', body: JSON.stringify({ startsAt: '2026-11-23T09:00:00.000Z' }) }),
  ))
})
