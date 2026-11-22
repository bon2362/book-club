import { test, expect } from './fixtures'
import { waitForHydration } from './helpers'
import { epic, feature } from 'allure-js-commons'

const TG_EMAIL = 'e2e-telegram-test@test.invalid'
const TG_NAME = 'E2E Telegram User'
const TG_USERNAME = 'e2e_tg_test'
const TG_PROVIDER_ACCOUNT_ID = '900100200'

test.describe('Авторизация через Telegram', () => {
  test.beforeEach(async ({ page }) => {
    await epic('Авторизация')
    await feature('Telegram')
    await page.request.post('/api/test/session', {
      data: {
        email: TG_EMAIL,
        name: TG_NAME,
        telegramUsername: TG_USERNAME,
        provider: 'telegram-preauth',
        providerAccountId: TG_PROVIDER_ACCOUNT_ID,
      },
    })
  })

  test.afterEach(async ({ page }) => {
    await page.request.delete('/api/test/session', {
      data: { email: TG_EMAIL, provider: 'telegram-preauth', providerAccountId: TG_PROVIDER_ACCOUNT_ID },
    })
  })

  test('ContactsForm не появляется — профиль сохраняется автоматически', async ({ page }) => {
    await page.goto('/')
    await waitForHydration(page)

    // Форма контактов не должна появляться для Telegram-пользователей
    await expect(page.getByRole('dialog')).not.toBeVisible()
  })

  test('профиль показывает @username вместо email', async ({ page }) => {
    await page.goto('/')
    await waitForHydration(page)

    // Открываем профиль (десктопная кнопка — имя пользователя)
    await page.getByRole('button', { name: TG_NAME }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Открываем вкладку "Профиль" в личном кабинете
    await page.getByRole('dialog').getByRole('button', { name: 'Профиль' }).click()

    // Preferred Telegram/contact comes from users.contacts and is shown as editable profile field.
    await expect(page.getByLabel('Telegram')).toHaveValue('@' + TG_USERNAME)
    await expect(page.getByText(TG_EMAIL)).not.toBeVisible()
  })
  test('профиль показывает команду для ручной отправки боту при привязке Telegram', async ({ page }) => {
    await page.addInitScript(() => {
      window.open = () => null
    })
    await page.route('**/api/me', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ user: { authMethods: [] } }),
    }))
    await page.route('**/api/account/identities/telegram/link-start', route => route.fulfill({
      contentType: 'application/json',
      body: JSON.stringify({ nonce: 'e2e-link-nonce' }),
    }))

    await page.goto('/')
    await waitForHydration(page)
    await page.getByRole('button', { name: TG_NAME }).click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: 'Профиль' }).click()

    await dialog.getByTestId('link-telegram-button').click()
    await expect(dialog.getByTestId('telegram-link-command')).toHaveText('/start link_e2e-link-nonce')
    await expect(dialog.getByRole('button', { name: 'Скопировать команду Telegram' })).toBeVisible()
    await page.reload()
    await waitForHydration(page)
  })
})
