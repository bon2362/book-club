import { expect, test } from './fixtures'
import { waitForHydration } from './helpers'
import { epic, feature } from 'allure-js-commons'

// Mini App, открытый Direct Link'ом из темы группы:
// t.me/<bot>?startapp=calendar_<bindingId> → /tg/topic-calendar.
// Telegram SDK и API подменяются: проверяется клиентский флоу точки входа
// (разрешение привязки → сетка → сохранение → обновление сообщения темы).

const BINDING_ID = 'e2e-binding-1'

const calendarState = {
  slug: 'zarya-vsego',
  book: { title: 'Заря всего', author: 'Дэвид Грэбер' },
  position: 1,
  circleExists: true,
  durationMinutes: 60,
  window: { start: '2026-11-23T00:00:00.000Z', end: '2026-11-30T00:00:00.000Z' },
  now: '2026-11-22T10:00:00.000Z',
  participants: [
    { ref: 'me', displayName: 'Евгений', timezone: 'UTC', timezoneConfirmed: true, marked: false, intervals: [] as Array<{ startsAt: string; endsAt: string }>, busy: [] },
    { ref: 'kate', displayName: 'Катя', timezone: 'UTC', timezoneConfirmed: true, marked: true, intervals: [{ startsAt: '2026-11-23T08:00:00.000Z', endsAt: '2026-11-23T10:00:00.000Z' }], busy: [] },
  ],
  meetings: [],
  viewer: { ref: 'me', canEdit: true, isAdmin: false, actingAsRef: 'me', timezone: 'UTC', timezoneConfirmed: true },
  migrationRequired: false,
}

test.describe('Telegram Mini App из темы группы', () => {
  test.beforeEach(async ({ page }) => {
    await epic('Календарь круга')
    await feature('Telegram-тема')
    // Настоящий SDK (подключается страницей beforeInteractive) перезаписал бы
    // подменённый window.Telegram.WebApp пустым initData — отдаём пустой скрипт.
    await page.route('https://telegram.org/js/**', (route) => route.fulfill({ contentType: 'application/javascript', body: '' }))
  })

  test('открывает календарь по start_param, сохраняет отметку, обновляет тему и держит отметку после перезагрузки', async ({ page }) => {
    await page.addInitScript((bindingId) => {
      Object.defineProperty(window, 'Telegram', {
        value: { WebApp: { initData: 'e2e-signed-data', initDataUnsafe: { start_param: `calendar_${bindingId}` }, ready() {}, requestFullscreen() {} } },
        configurable: true,
      })
    }, BINDING_ID)

    let savedIntervals = calendarState.participants[0].intervals
    const authHeaders: string[] = []
    let refreshes = 0
    await page.route(`**/api/tg/calendar/topic/${BINDING_ID}`, async (route) => {
      authHeaders.push(route.request().headers()['authorization'] ?? '')
      if (route.request().method() === 'POST') { refreshes += 1; await route.fulfill({ json: { ok: true } }); return }
      await route.fulfill({ json: { slug: 'zarya-vsego' } })
    })
    await page.route('**/api/tg/calendar/zarya-vsego**', async (route) => {
      const request = route.request()
      if (request.method() === 'PUT') {
        savedIntervals = JSON.parse(request.postData() ?? '{}').intervals
        await route.fulfill({ json: { ok: true, intervals: savedIntervals } })
        return
      }
      await route.fulfill({ json: { ...calendarState, participants: [{ ...calendarState.participants[0], marked: savedIntervals.length > 0, intervals: savedIntervals }, calendarState.participants[1]] } })
    })

    await page.goto('/tg/topic-calendar')
    await waitForHydration(page)
    await expect(page.getByRole('heading', { name: 'Заря всего' })).toBeVisible()
    expect(authHeaders[0]).toBe('tma e2e-signed-data')

    const cell = page.getByLabel(/23 нояб.*09:00/i)
    const saved = page.waitForResponse((response) => response.url().endsWith('/api/tg/calendar/zarya-vsego/availability') && response.request().method() === 'PUT')
    await cell.click()
    await saved
    expect(savedIntervals).toEqual([{ startsAt: '2026-11-23T09:00:00.000Z', endsAt: '2026-11-23T10:00:00.000Z' }])
    await expect.poll(() => refreshes).toBe(1)

    await page.reload()
    await waitForHydration(page)
    await expect(page.getByLabel(/23 нояб.*09:00/i).locator('[data-mine-marker="true"]')).toBeVisible()
  })

  test('без start_param календарь не открывается и API не вызывается', async ({ page }) => {
    await page.addInitScript(() => {
      Object.defineProperty(window, 'Telegram', { value: { WebApp: { initData: 'e2e-signed-data', initDataUnsafe: {}, ready() {} } }, configurable: true })
    })
    let calls = 0
    await page.route('**/api/tg/calendar/**', async (route) => { calls += 1; await route.fulfill({ status: 500, json: {} }) })
    await page.goto('/tg/topic-calendar')
    await waitForHydration(page)
    await expect(page.getByText('Ссылка на календарь неполная')).toBeVisible()
    expect(calls).toBe(0)
  })
})
