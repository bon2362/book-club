import { test, expect } from '@playwright/test'

const TEST_EMAIL = 'e2e-signup@test.invalid'
const TEST_NAME = 'E2E Signup User'
const TEST_CONTACT = '@e2e_test_user'

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

test('пользователь может записаться на книгу', async ({ page }) => {
  await page.goto('/')

  // Закрываем блок "О клубе" если он появился (может перекрывать кнопки книг)
  const closeAbout = page.getByTitle('Скрыть')
  if (await closeAbout.isVisible({ timeout: 2000 }).catch(() => false)) {
    await closeAbout.click()
  }

  // Кликаем на первую доступную кнопку "Хочу читать"
  const toggleBtn = page.getByRole('button', { name: /хочу читать/i }).first()
  await expect(toggleBtn).toBeVisible()
  await toggleBtn.click()

  // Должна появиться форма с полями имя и контакт
  await expect(page.getByLabel(/имя/i)).toBeVisible()

  // Заполняем форму
  await page.getByLabel(/имя/i).fill(TEST_NAME)
  await page.getByLabel(/telegram/i).fill(TEST_CONTACT)

  // Отправляем
  await page.getByRole('button', { name: /сохранить/i }).click()

  // Форма должна закрыться, книга выбрана (кнопка изменилась)
  await expect(page.getByLabel(/имя/i)).not.toBeVisible()
  await expect(page.getByRole('button', { name: /записан/i }).first()).toBeVisible()
})
