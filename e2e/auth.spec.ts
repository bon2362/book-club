import { test, expect } from '@playwright/test'
import { epic, feature } from 'allure-js-commons'

const TEST_EMAIL = 'e2e-auth@test.invalid'
const TEST_NAME = 'E2E Auth User'

test.beforeEach(async () => {
  await epic('Авторизация')
  await feature('Вход и выход')
})

test.afterEach(async ({ page }) => {
  await page.request.delete('/api/test/session', {
    data: { email: TEST_EMAIL },
  })
})

test('кнопка входа видна неавторизованному пользователю', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: /войти/i })).toBeVisible()
})

test('после логина пользователь авторизован — кнопки входа нет', async ({ page }) => {
  await page.request.post('/api/test/session', {
    data: { email: TEST_EMAIL, name: TEST_NAME },
  })

  await page.goto('/')
  await expect(page.getByRole('button', { name: /войти/i })).not.toBeVisible()
})
