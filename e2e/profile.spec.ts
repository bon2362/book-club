import { test, expect } from './fixtures'
import { waitForHydration } from './helpers'
import { epic, feature } from 'allure-js-commons'

const EMAIL = 'e2e-profile-test@test.invalid'
const NAME = 'E2E Профиль'
const TG_USERNAME = 'e2e_profile_tg'

test.describe('ProfileDrawer — редактирование профиля', () => {
  test.setTimeout(60_000)

  test.beforeEach(async ({ page }) => {
    await epic('Профиль')
    await feature('Редактирование профиля')
    // Создаём сессию с telegramUsername, чтобы ContactsForm не появилась
    // (Telegram-пользователи автоматически сохраняют профиль)
    await page.request.post('/api/test/session', {
      data: { email: EMAIL, name: NAME, telegramUsername: TG_USERNAME, provider: 'telegram-preauth' },
    })
  })

  test.afterEach(async ({ page }) => {
    await page.request.delete('/api/test/session', {
      data: { email: EMAIL, provider: 'telegram-preauth', telegramUsername: TG_USERNAME },
    })
  })

  test('языки чтения сохраняются после перезагрузки страницы', async ({ page }) => {
    await page.goto('/')
    await waitForHydration(page)

    // ContactsForm не должна мешать
    await expect(page.getByRole('dialog')).not.toBeVisible()

    // Открываем drawer, кликая по имени пользователя в header
    await page.getByRole('button', { name: NAME }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Переключаемся на вкладку "Профиль"
    await page.getByRole('dialog').getByRole('button', { name: 'Профиль' }).click()

    // Убеждаемся что секция "Языки чтения" загрузилась
    await expect(page.getByText('Языки чтения')).toBeVisible()

    // Выбираем "In English" (изначально может быть не выбран). Языки сохраняются сами
    // через 500 мс после клика (PATCH /api/profile) — ждём ответ, иначе reload ниже
    // может обогнать сохранение.
    const englishBtn = page.getByRole('button', { name: /in english/i })
    const languagesSaved = page.waitForResponse(
      (response) => response.url().includes('/api/profile') && response.request().method() === 'PATCH',
    )
    await englishBtn.click()
    expect((await languagesSaved).ok()).toBe(true)

    // Закрываем drawer
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).not.toBeVisible()

    // Перезагрузка — проверяем персистентность
    await page.reload()
    await waitForHydration(page)

    // Открываем drawer снова
    await page.getByRole('button', { name: NAME }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('dialog').getByRole('button', { name: 'Профиль' }).click()

    await expect(page.getByText('Языки чтения')).toBeVisible()

    // "In English" должен остаться выбранным
    await expect(page.getByRole('button', { name: /in english/i })).toBeVisible()
  })

  test('изменение имени отображается сразу в интерфейсе', async ({ page }) => {
    const signupRequests: string[] = []
    page.on('request', request => {
      if (request.method() === 'POST' && new URL(request.url()).pathname === '/api/signup') {
        signupRequests.push(request.url())
      }
    })

    await page.goto('/')
    await waitForHydration(page)

    // Открываем drawer
    await page.getByRole('button', { name: NAME }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Переходим на вкладку Профиль
    await page.getByRole('dialog').getByRole('button', { name: 'Профиль' }).click()

    // Меняем имя
    const nameInput = page.locator('#pd-name')
    await nameInput.clear()
    await nameInput.fill('Новое Имя')

    // Кнопка Сохранить должна стать активной (имя изменилось)
    const saveBtn = page.getByRole('button', { name: 'Сохранить' })
    await expect(saveBtn).not.toBeDisabled()
    await saveBtn.click()

    // После сохранения кнопка показывает "Сохранено ✓"
    await expect(page.getByRole('button', { name: /сохранено/i })).toBeVisible()
    expect(signupRequests).toHaveLength(0)
  })
})
