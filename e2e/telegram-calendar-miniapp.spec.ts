import { expect, test } from './fixtures'
import { epic, feature } from 'allure-js-commons'

const calendarState = {
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

test.describe('Telegram Mini App — календарь круга', () => {
  test.beforeEach(async ({ page }) => {
    await epic('Календарь круга')
    await feature('Telegram Mini App')
    // Настоящий SDK (подключается страницей beforeInteractive) перезаписал бы
    // подменённый window.Telegram.WebApp пустым initData — отдаём пустой скрипт.
    await page.route('https://telegram.org/js/**', (route) => route.fulfill({ contentType: 'application/javascript', body: '' }))
    await page.addInitScript(() => {
      Object.defineProperty(window, 'Telegram', { value: { WebApp: { initData: 'e2e-signed-data', ready() {}, requestFullscreen() {} } }, configurable: true })
    })
  })

  test('отметка сохраняется и остаётся после перезагрузки', async ({ page }) => {
    let savedIntervals = calendarState.participants[0].intervals
    await page.route('**/api/tg/calendar/long-march-1**', async (route) => {
      const request = route.request()
      if (request.method() === 'PUT') {
        savedIntervals = JSON.parse(request.postData() ?? '{}').intervals
        await route.fulfill({ json: { ok: true, intervals: savedIntervals } })
        return
      }
      await route.fulfill({ json: { ...calendarState, participants: [{ ...calendarState.participants[0], marked: savedIntervals.length > 0, intervals: savedIntervals }, calendarState.participants[1]] } })
    })

    await page.goto('/tg/calendar/long-march-1')
    const cell = page.getByLabel(/23 нояб.*09:00/i)
    await expect(cell).toBeVisible()
    await cell.click()
    await expect.poll(() => savedIntervals).toEqual([{ startsAt: '2026-11-23T09:00:00.000Z', endsAt: '2026-11-23T10:00:00.000Z' }])

    await page.reload()
    await expect(page.getByLabel(/23 нояб.*09:00/i).locator('[data-mine-marker="true"]')).toBeVisible()
  })
})
