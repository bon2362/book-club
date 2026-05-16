import { test, expect } from '@playwright/test'
import { epic, feature } from 'allure-js-commons'

const ADMIN_EMAIL = 'e2e-admin-users-admin@test.invalid'
const ADMIN_NAME = 'E2E Admin Users Admin'
const USER_EMAIL = 'e2e-admin-users-user@test.invalid'
const USER_NAME = 'E2E Admin Users Reader'
const USER_ID = `test:${USER_EMAIL}`
const USER_CONTACT = '@e2e_admin_users'
const BOOK_A = 'Тестовая книга 1'
const BOOK_B = 'Тестовая книга 2'
const REGISTERED_FEEDBACK = 'E2E registered feedback for admin users'
const ANON_FEEDBACK = 'E2E anonymous feedback for admin users'

test.describe('админка — пользователи и фидбеки', () => {
  test.setTimeout(120_000)

  let feedbackIds: string[] = []

  test.beforeEach(async ({ page }) => {
    await epic('Администрирование')
    await feature('Карточка пользователя')
    feedbackIds = []

    await page.request.post('/api/test/session', {
      data: { email: USER_EMAIL, name: USER_NAME },
    })
    await page.request.post('/api/test/signup', {
      data: { userId: USER_ID, name: USER_NAME, email: USER_EMAIL, contacts: USER_CONTACT, selectedBooks: [BOOK_A, BOOK_B] },
    })
    const registered = await page.request.post('/api/test/feedback', {
      data: { userId: USER_ID, name: USER_NAME, email: USER_EMAIL, message: REGISTERED_FEEDBACK },
    })
    const anonymous = await page.request.post('/api/test/feedback', {
      data: { userId: null, name: 'Anon E2E', email: 'anon-admin-users@test.invalid', message: ANON_FEEDBACK },
    })
    feedbackIds.push((await registered.json()).id, (await anonymous.json()).id)

    await page.request.post('/api/test/session', {
      data: { email: ADMIN_EMAIL, name: ADMIN_NAME, isAdmin: true },
    })
  })

  test.afterEach(async ({ page }) => {
    await page.request.delete('/api/test/feedback', { data: { ids: feedbackIds } })
    await page.request.delete('/api/test/signup', { data: { userId: USER_ID } })
    await page.request.delete('/api/test/session', { data: { email: ADMIN_EMAIL } })
    await page.request.delete('/api/test/session', { data: { email: USER_EMAIL } })
  })

  async function openUserDrawer(page: import('@playwright/test').Page) {
    await page.goto('/admin')
    await page.waitForLoadState('networkidle')
    await page.getByLabel('Поиск пользователей').fill(USER_EMAIL)
    await page.locator('tr').filter({ hasText: USER_EMAIL }).click()
    await expect(page.getByRole('dialog', { name: /карточка пользователя/i })).toBeVisible()
  }

  test('поиск открывает drawer со всеми секциями пользователя', async ({ page }) => {
    await openUserDrawer(page)

    await expect(page.getByRole('dialog')).toContainText(USER_NAME)
    await expect(page.getByRole('dialog')).toContainText(USER_CONTACT)
    await expect(page.getByRole('dialog')).toContainText('Профиль')
    await expect(page.getByRole('dialog')).toContainText('Записи на книги')
    await expect(page.getByRole('dialog')).toContainText('Предложения книг')
    await expect(page.getByRole('dialog')).toContainText('Фидбеки')
    await expect(page.getByRole('dialog')).toContainText(BOOK_A)
    await expect(page.getByRole('dialog')).toContainText(REGISTERED_FEEDBACK)
  })

  test('снятие записи на книгу сохраняется после reload', async ({ page }) => {
    await openUserDrawer(page)

    page.on('dialog', dialog => dialog.accept())
    const bookPill = page.getByRole('dialog').locator('span').filter({ hasText: BOOK_B }).first()
    await bookPill.getByTitle('Снять запись').click()

    await expect.poll(async () => {
      const state = await (await page.request.get(`/api/test/user?email=${encodeURIComponent(USER_EMAIL)}`)).json()
      return state.signupBooks.sort()
    }).toEqual([BOOK_A])

    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.getByLabel('Поиск пользователей').fill(USER_EMAIL)
    await expect(page.locator('tr').filter({ hasText: USER_EMAIL })).toContainText('1')
  })

  test('удаление пользователя закрывает drawer и убирает строку', async ({ page }) => {
    await openUserDrawer(page)

    page.on('dialog', dialog => dialog.accept())
    await page.getByRole('dialog').getByRole('button', { name: /удалить пользователя/i }).click()

    await expect(page.getByRole('dialog')).not.toBeVisible()
    await expect(page.locator('tr').filter({ hasText: USER_EMAIL })).toHaveCount(0)
  })

  test('вкладка фидбеков показывает фильтры, поиск и открывает пользователя', async ({ page }) => {
    await page.goto('/admin')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: /фидбеки/i }).click()

    await expect(page.getByText(REGISTERED_FEEDBACK)).toBeVisible()
    await expect(page.getByText(ANON_FEEDBACK)).toBeVisible()

    await page.getByRole('button', { name: /анонимные/i }).click()
    await expect(page.getByText(ANON_FEEDBACK)).toBeVisible()
    await expect(page.getByText(REGISTERED_FEEDBACK)).not.toBeVisible()

    await page.getByRole('button', { name: /все/i }).click()
    await page.getByLabel('Поиск фидбеков').fill('registered feedback')
    await expect(page.getByText(REGISTERED_FEEDBACK)).toBeVisible()
    await expect(page.getByText(ANON_FEEDBACK)).not.toBeVisible()

    await page.getByRole('button', { name: USER_NAME }).click()
    await expect(page.getByRole('dialog')).toContainText(USER_EMAIL)
  })
})
