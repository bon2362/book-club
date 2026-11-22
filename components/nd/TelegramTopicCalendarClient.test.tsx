import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import TelegramTopicCalendarClient from './TelegramTopicCalendarClient'

const calendarState = {
  slug: 'zarya-vsego',
  book: { title: 'Заря всего', author: 'Дэвид Грэбер' },
  position: 1,
  circleExists: true,
  durationMinutes: 60,
  window: { start: '2026-11-23T00:00:00.000Z', end: '2026-11-30T00:00:00.000Z' },
  now: '2026-11-22T10:00:00.000Z',
  participants: [{ ref: 'me', displayName: 'Я', timezone: 'UTC', timezoneConfirmed: true, marked: false, intervals: [], busy: [] }],
  meetings: [],
  viewer: { ref: 'me', canEdit: true, isAdmin: false, actingAsRef: 'me', timezone: 'UTC', timezoneConfirmed: true },
  migrationRequired: false,
}

function response(body: unknown, status = 200) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body })
}

function telegram(startParam?: string) {
  window.Telegram = { WebApp: { initData: 'signed-init-data', initDataUnsafe: startParam ? { start_param: startParam } : {}, ready: jest.fn(), requestFullscreen: jest.fn() } }
}

function routeFetch(topic: () => Promise<unknown> = () => response({ slug: 'zarya-vsego' })) {
  global.fetch = jest.fn().mockImplementation((url: string, init?: RequestInit) => {
    if (url === '/api/tg/calendar/topic/binding-1') return init?.method === 'POST' ? response({ ok: true }) : topic()
    if (url.endsWith('/availability')) return response({ ok: true, intervals: [] })
    return response(calendarState)
  })
}

beforeEach(() => routeFetch())
afterEach(() => {
  delete window.Telegram
  jest.useRealTimers()
  jest.restoreAllMocks()
})

test('вне Telegram показывает понятную ошибку', () => {
  render(<TelegramTopicCalendarClient />)
  expect(screen.getByRole('alert')).toHaveTextContent('Откройте календарь из Telegram.')
  expect(global.fetch).not.toHaveBeenCalled()
})

test.each([undefined, 'link_abc', 'calendar_', 'calendar_../x'])('без корректного start_param (%s) не ходит в API', (param) => {
  telegram(param)
  render(<TelegramTopicCalendarClient />)
  expect(screen.getByRole('alert')).toHaveTextContent('Ссылка на календарь неполная')
  expect(global.fetch).not.toHaveBeenCalled()
})

test('разрешает привязку с подписанным initData и запускает существующий календарь', async () => {
  telegram('calendar_binding-1')
  render(<TelegramTopicCalendarClient />)
  expect(await screen.findByRole('heading', { name: 'Заря всего' })).toBeInTheDocument()
  expect(global.fetch).toHaveBeenCalledWith('/api/tg/calendar/topic/binding-1', { headers: { Authorization: 'tma signed-init-data' } })
  expect(global.fetch).toHaveBeenCalledWith('/api/tg/calendar/zarya-vsego', expect.objectContaining({ headers: { Authorization: 'tma signed-init-data' } }))
})

test('берёт start_param из адреса, если SDK его не дал', async () => {
  telegram()
  window.history.pushState({}, '', '/tg/topic-calendar?tgWebAppStartParam=calendar_binding-1')
  render(<TelegramTopicCalendarClient />)
  expect(await screen.findByRole('heading', { name: 'Заря всего' })).toBeInTheDocument()
  window.history.pushState({}, '', '/')
})

test('чужая или неизвестная привязка не раскрывает календарь', async () => {
  telegram('calendar_binding-1')
  routeFetch(() => response({ error: 'not_a_member' }, 403))
  render(<TelegramTopicCalendarClient />)
  expect(await screen.findByRole('alert')).toHaveTextContent('только участникам круга')
  expect(screen.queryByRole('heading')).not.toBeInTheDocument()
  expect((global.fetch as jest.Mock).mock.calls.map(([url]) => url)).toEqual(['/api/tg/calendar/topic/binding-1'])
})

test('непривязанный Telegram получает инструкцию', async () => {
  telegram('calendar_binding-1')
  routeFetch(() => response({ error: 'telegram_identity_not_linked' }, 403))
  render(<TelegramTopicCalendarClient />)
  expect(await screen.findByRole('alert')).toHaveTextContent('привяжите Telegram')
})

test('после сохранения отметки просит обновить сообщение темы', async () => {
  telegram('calendar_binding-1')
  render(<TelegramTopicCalendarClient />)
  const cell = await screen.findByLabelText(/23 нояб.*09:00/i)
  fireEvent.pointerDown(cell, { pointerType: 'mouse' })
  fireEvent.pointerUp(cell, { pointerType: 'mouse' })

  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/tg/calendar/topic/binding-1', expect.objectContaining({
    method: 'POST', headers: { Authorization: 'tma signed-init-data' },
  })), { timeout: 3000 })
})

test('закрытие Mini App сразу после клика не теряет обновление темы', async () => {
  telegram('calendar_binding-1')
  render(<TelegramTopicCalendarClient />)
  const cell = await screen.findByLabelText(/23 нояб.*09:00/i)
  fireEvent.pointerDown(cell, { pointerType: 'mouse' })
  fireEvent.pointerUp(cell, { pointerType: 'mouse' })
  await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/tg/calendar/zarya-vsego/availability', expect.anything()))
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)) })
  act(() => { window.dispatchEvent(new Event('pagehide')) })
  expect(global.fetch).toHaveBeenCalledWith('/api/tg/calendar/topic/binding-1', expect.objectContaining({ method: 'POST', keepalive: true }))
})
