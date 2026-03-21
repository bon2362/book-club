import { test, expect } from '@playwright/test'

const TG_EMAIL = 'e2e-telegram-test@test.invalid'
const TG_NAME = 'E2E Telegram User'
const TG_USERNAME = 'e2e_tg_test'

test.describe('Авторизация через Telegram', () => {
  test.beforeEach(async ({ page }) => {
    await page.request.post('/api/test/session', {
      data: { email: TG_EMAIL, name: TG_NAME, telegramUsername: TG_USERNAME, provider: 'telegram-preauth' },
    })
  })

  test.afterEach(async ({ page }) => {
    await page.request.delete('/api/test/session', { data: { email: TG_EMAIL } })
  })

  test('ContactsForm не появляется — профиль сохраняется автоматически', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Форма контактов не должна появляться для Telegram-пользователей
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })

  test('профиль показывает @username вместо email', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Открываем профиль (десктопная кнопка — имя пользователя)
    await page.getByRole('button', { name: TG_NAME }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Открываем вкладку "Профиль" в личном кабинете
    await page.getByRole('dialog').getByRole('button', { name: 'Профиль' }).click()

    // Должен показываться @username, не email
    await expect(page.getByText('@' + TG_USERNAME)).toBeVisible()
    await expect(page.getByText(TG_EMAIL)).not.toBeVisible()
  })
})
