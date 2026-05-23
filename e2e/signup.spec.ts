import { test, expect } from './fixtures'
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

  await page.reload()
  await page.waitForLoadState('networkidle')

  const me = await page.request.get('/api/me')
  expect(me.ok()).toBeTruthy()
  const meData = await me.json()
  expect(meData.user.name).toBe(TEST_NAME)
  expect(meData.user.contacts).toBe(TEST_CONTACT)
  expect(meData.user.authProvider).toBe('email')
  expect(meData.user.lastSignInAt).toBeTruthy()

  // Закрываем блок "О клубе" если мешает
  const closeAbout = page.getByTitle('Скрыть')
  if (await closeAbout.isVisible({ timeout: 1000 }).catch(() => false)) {
    await closeAbout.click()
  }

  // Теперь можно записаться на книгу
  const toggleBtn = page.getByRole('button', { name: /хочу читать/i }).first()
  await expect(toggleBtn).toBeVisible()
  await toggleBtn.click()

  // Кнопка должна смениться на "Вы записаны"
  await expect(page.getByRole('button', { name: /вы записаны/i }).first()).toBeVisible()
  await expect.poll(async () => {
    const userState = await (await page.request.get(`/api/test/user?email=${encodeURIComponent(TEST_EMAIL)}`)).json()
    return userState.signupBooks.length
  }).toBeGreaterThan(0)
})

test('повторный submit заменяет список книг, а не добавляет к старому', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByLabel(/имя/i)).toBeVisible()
  await page.getByLabel(/имя/i).fill(TEST_NAME)
  await page.getByLabel(/telegram/i).fill(TEST_CONTACT)
  await page.getByRole('button', { name: /сохранить/i }).click()
  await expect(page.getByLabel(/имя/i)).not.toBeVisible()

  const book1 = page.locator('article').filter({ hasText: 'Тестовая книга 1' })
  const book2 = page.locator('article').filter({ hasText: 'Тестовая книга 2' })
  const book3 = page.locator('article').filter({ hasText: 'Тестовая книга 3' })

  await book1.getByRole('button', { name: /хочу читать/i }).click()
  await book2.getByRole('button', { name: /хочу читать/i }).click()

  await expect.poll(async () => {
    const userState = await (await page.request.get(`/api/test/user?email=${encodeURIComponent(TEST_EMAIL)}`)).json()
    return userState.signupBooks.sort()
  }).toEqual(['Тестовая книга 1', 'Тестовая книга 2'])

  await book2.getByRole('button', { name: /вы записаны/i }).click()
  await book3.getByRole('button', { name: /хочу читать/i }).click()

  await expect.poll(async () => {
    const userState = await (await page.request.get(`/api/test/user?email=${encodeURIComponent(TEST_EMAIL)}`)).json()
    return userState.signupBooks.sort()
  }).toEqual(['Тестовая книга 1', 'Тестовая книга 3'])

  await page.reload({ waitUntil: 'domcontentloaded' })
  await expect(book1.getByRole('button', { name: /вы записаны/i })).toBeVisible()
  await expect(book3.getByRole('button', { name: /вы записаны/i })).toBeVisible()

  const userState = await (await page.request.get(`/api/test/user?email=${encodeURIComponent(TEST_EMAIL)}`)).json()
  expect(userState.signupBooks.sort()).toEqual(['Тестовая книга 1', 'Тестовая книга 3'])
})
