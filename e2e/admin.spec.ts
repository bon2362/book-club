import { test, expect } from '@playwright/test'
import { epic, feature } from 'allure-js-commons'

// /admin перенаправляет на / если session.user.isAdmin !== true.
// Тестовые сессии через /api/test/session не имеют isAdmin.

const TEST_EMAIL = 'e2e-admin-test@test.invalid'
const TEST_NAME = 'E2E Admin Test User'

test.describe('панель администратора — доступ', () => {
  test.beforeEach(async () => {
    await epic('Администрирование')
    await feature('Панель управления')
  })

  test.afterEach(async ({ page }) => {
    await page.request.delete('/api/test/session', {
      data: { email: TEST_EMAIL },
    })
  })

  test('неавторизованный пользователь перенаправляется с /admin на главную', async ({ page }) => {
    await page.goto('/admin')
    await expect(page).toHaveURL('/')
  })

  test('авторизованный не-admin перенаправляется с /admin на главную', async ({ page }) => {
    await page.request.post('/api/test/session', {
      data: { email: TEST_EMAIL, name: TEST_NAME },
    })
    await page.goto('/admin')
    await expect(page).toHaveURL('/')
  })

  test('обычный пользователь не видит ссылку /admin на главной', async ({ page }) => {
    await page.request.post('/api/test/session', {
      data: { email: TEST_EMAIL, name: TEST_NAME },
    })
    await page.goto('/')
    await expect(page.locator('a[href="/admin"]')).toHaveCount(0)
  })
})
