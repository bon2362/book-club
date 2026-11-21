import { expect, test } from './fixtures'
import { epic, feature } from 'allure-js-commons'

const state = {
  slug: 'long-march-1', book: { title: 'Долгое наступление', author: null }, position: 1, circleExists: true, durationMinutes: 60,
  window: { start: '2026-11-23T00:00:00.000Z', end: '2026-11-30T00:00:00.000Z' }, now: '2026-11-22T10:00:00.000Z',
  participants: [{ ref: 'me', displayName: 'Я', timezone: 'UTC', timezoneConfirmed: true, marked: false, intervals: [], busy: [] }], meetings: [],
  viewer: { ref: 'me', canEdit: true, isAdmin: false, actingAsRef: 'me', timezone: 'UTC', timezoneConfirmed: true }, migrationRequired: false,
}

test('Telegram Mini App умещает сетку на узких экранах без горизонтальной прокрутки', async ({ page }) => {
  await epic('Календарь круга')
  await feature('Telegram Mini App: геометрия')
  await page.addInitScript(() => {
    Object.defineProperty(window, 'Telegram', { value: { WebApp: { initData: 'e2e-signed-data', ready() {}, requestFullscreen() {} } }, configurable: true })
  })
  await page.route('**/api/tg/calendar/long-march-1**', async (route) => route.fulfill({ json: state }))
  for (const width of [320, 393]) {
    await page.setViewportSize({ width, height: 844 })
    await page.goto('/tg/calendar/long-march-1')
    const calendar = page.getByTestId('telegram-calendar')
    await expect(calendar).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)
    const cell = await page.getByTestId('calendar-cell').first().boundingBox()
    expect(cell).not.toBeNull()
    expect(cell!.height).toBeGreaterThanOrEqual(44)
  }
})
