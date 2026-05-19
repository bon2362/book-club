import { test, expect } from './fixtures'
import { epic, feature } from 'allure-js-commons'

const ADMIN_EMAIL = 'e2e-admin-footer@test.invalid'
const ADMIN_NAME = 'E2E Admin Footer'

test.describe('админка — виджеты подвала', () => {
  test.beforeEach(async ({ page }) => {
    await epic('Администрирование')
    await feature('Виджеты подвала')

    await page.request.post('/api/test/session', {
      data: { email: ADMIN_EMAIL, name: ADMIN_NAME, isAdmin: true },
    })
  })

  test.afterEach(async ({ page }) => {
    await page.request.delete('/api/test/session', { data: { email: ADMIN_EMAIL } })
  })

  test('кнопка обновляет все виджеты без перезагрузки страницы', async ({ page }) => {
    let statusRequests = 0
    let digestRequests = 0
    let allureRequests = 0

    await page.route('**/api/admin/status', async route => {
      statusRequests += 1
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ ci: null, deploy: null }),
      })
    })
    await page.route('**/api/admin/digest-status', async route => {
      digestRequests += 1
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({ status: 'empty' }),
      })
    })
    await page.route('https://bon2362.github.io/book-club/widgets/summary.json', async route => {
      allureRequests += 1
      await route.fulfill({
        contentType: 'application/json',
        body: JSON.stringify({
          statistic: { passed: 10, failed: 0, broken: 0, skipped: 0, total: 10 },
          time: { stop: Date.now() },
        }),
      })
    })

    await page.goto('/admin')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('button', { name: /обновить виджеты/i })).toBeVisible()

    await expect.poll(() => [statusRequests, digestRequests, allureRequests].every(count => count > 0)).toBe(true)
    const beforeClick = {
      statusRequests,
      digestRequests,
      allureRequests,
    }

    await page.getByRole('button', { name: /обновить виджеты/i }).click()

    await expect.poll(() => [
      statusRequests > beforeClick.statusRequests,
      digestRequests > beforeClick.digestRequests,
      allureRequests > beforeClick.allureRequests,
    ].every(Boolean)).toBe(true)
    await expect(page).toHaveURL(/\/admin$/)
  })
})
