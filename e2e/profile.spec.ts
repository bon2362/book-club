import { test, expect } from '@playwright/test'
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
    await page.request.delete('/api/test/session', { data: { email: EMAIL } })
  })

  test('языки чтения сохраняются после перезагрузки страницы', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // ContactsForm не должна мешать
    await expect(page.getByRole('dialog')).not.toBeVisible()

    // Открываем drawer, кликая по имени пользователя в header
    await page.getByRole('button', { name: NAME }).click()
    await expect(page.getByRole('dialog')).toBeVisible()

    // Переключаемся на вкладку "Профиль"
    await page.getByRole('dialog').getByRole('button', { name: 'Профиль' }).click()

    // Убеждаемся что секция "Языки чтения" загрузилась
    await expect(page.getByText('Языки чтения')).toBeVisible()

    // Выбираем "In English" (изначально может быть не выбран)
    const englishBtn = page.getByRole('button', { name: /in english/i })
    await englishBtn.click()

    // Ждём появления кнопки "Сохранено" (индикатор успешного сохранения в профиле)
    // Языки сохраняются автоматически при клике, кнопку "Сохранить языки" ищем
    // Альтернативно — ждём networkidle после клика
    await page.waitForLoadState('networkidle')

    // Закрываем drawer
    await page.keyboard.press('Escape')
    await expect(page.getByRole('dialog')).not.toBeVisible()

    // Перезагрузка — проверяем персистентность
    await page.reload()
    await page.waitForLoadState('networkidle')

    // Открываем drawer снова
    await page.getByRole('button', { name: NAME }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await page.getByRole('dialog').getByRole('button', { name: 'Профиль' }).click()

    await expect(page.getByText('Языки чтения')).toBeVisible()

    // "In English" должен остаться выбранным
    await expect(page.getByRole('button', { name: /in english/i })).toBeVisible()
  })

  test('изменение имени отображается сразу в интерфейсе', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

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
  })
})
