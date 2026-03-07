import { test, expect } from '@playwright/test'

const TEST_EMAIL = 'e2e-auth@test.invalid'
const TEST_NAME = 'E2E Auth User'

test.afterEach(async ({ request }) => {
  await request.delete('/api/test/session', {
    data: { email: TEST_EMAIL },
  })
})

test('кнопка входа видна неавторизованному пользователю', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: /войти/i })).toBeVisible()
})

test('после логина пользователь авторизован — кнопки входа нет', async ({ page, request }) => {
  await request.post('/api/test/session', {
    data: { email: TEST_EMAIL, name: TEST_NAME },
  })

  await page.goto('/')
  await expect(page.getByRole('button', { name: /войти/i })).not.toBeVisible()
})
