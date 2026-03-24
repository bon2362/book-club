import { test, expect } from '@playwright/test'
import { epic, feature } from 'allure-js-commons'

const TEST_EMAIL = 'e2e-signup@test.invalid'
const TEST_NAME = 'E2E Signup User'
const TEST_CONTACT = '@e2e_test_user'

test.beforeEach(async () => {
  await epic('Авторизация')
  await feature('Регистрация')
})

test.beforeEach(async ({ page }) => {
  await page.request.post('/api/test/session', {
    data: { email: TEST_EMAIL, name: TEST_NAME },
  })
})

test.afterEach(async ({ page }) => {
  await page.request.delete('/api/test/session', {
    data: { email: TEST_EMAIL },
  })
})

test('новый пользователь заполняет профиль и записывается на книгу', async ({ page }) => {
  await page.goto('/')

  // При первом входе автоматически открывается форма профиля (ContactsForm)
  await expect(page.getByLabel(/имя/i)).toBeVisible()

  // Заполняем профиль
  await page.getByLabel(/имя/i).fill(TEST_NAME)
  await page.getByLabel(/telegram/i).fill(TEST_CONTACT)
  await page.getByRole('button', { name: /сохранить/i }).click()

  // Форма профиля закрылась
  await expect(page.getByLabel(/имя/i)).not.toBeVisible()

  // Закрываем блок "О клубе" если мешает
  const closeAbout = page.getByTitle('Скрыть')
  if (await closeAbout.isVisible({ timeout: 1000 }).catch(() => false)) {
    await closeAbout.click()
  }

  // Теперь можно записаться на книгу
  const toggleBtn = page.getByRole('button', { name: /хочу читать/i }).first()
  await expect(toggleBtn).toBeVisible()
  await toggleBtn.click()

  // Кнопка должна смениться на "Записан"
  await expect(page.getByRole('button', { name: /записан/i }).first()).toBeVisible()
})
