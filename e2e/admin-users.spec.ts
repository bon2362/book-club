import { test, expect } from './fixtures'
import { epic, feature } from 'allure-js-commons'

const ADMIN_NAME = 'E2E Admin Users Admin'
const USER_NAME = 'E2E Admin Users Reader'
const USER_CONTACT = '@e2e_admin_users'
const BOOK_A = 'Тестовая книга 1'
const BOOK_B = 'Тестовая книга 2'
const REGISTERED_FEEDBACK_BASE = 'E2E registered feedback for admin users'
const ANON_FEEDBACK_BASE = 'E2E anonymous feedback for admin users'

test.describe('админка — пользователи и фидбеки', () => {
  test.setTimeout(120_000)

  let adminEmail = ''
  let userEmail = ''
  let userId = ''
  let registeredFeedback = ''
  let anonFeedback = ''
  let feedbackIds: string[] = []

  test.beforeEach(async ({ page }, testInfo) => {
    await epic('Администрирование')
    await feature('Карточка пользователя')
    feedbackIds = []
    const runId = `${testInfo.workerIndex}-${testInfo.retry}-${Date.now()}`
    adminEmail = `e2e-admin-users-admin-${runId}@test.invalid`
    userEmail = `e2e-admin-users-user-${runId}@test.invalid`
    registeredFeedback = `${REGISTERED_FEEDBACK_BASE} ${runId}`
    anonFeedback = `${ANON_FEEDBACK_BASE} ${runId}`

    const userSession = await page.request.post('/api/test/session', {
      data: { email: userEmail, name: USER_NAME },
    })
    userId = (await userSession.json()).userId
    await page.request.post('/api/test/signup', {
      data: { userId, name: USER_NAME, email: userEmail, contacts: USER_CONTACT, selectedBooks: [BOOK_A, BOOK_B] },
    })
    const registered = await page.request.post('/api/test/feedback', {
      data: { userId, name: USER_NAME, email: userEmail, message: registeredFeedback },
    })
    const anonymous = await page.request.post('/api/test/feedback', {
      data: { userId: null, name: 'Anon E2E', email: `anon-admin-users-${runId}@test.invalid`, message: anonFeedback },
    })
    feedbackIds.push((await registered.json()).id, (await anonymous.json()).id)

    await page.request.post('/api/test/session', {
      data: { email: adminEmail, name: ADMIN_NAME, isAdmin: true },
    })
  })

  test.afterEach(async ({ page }) => {
    await page.request.delete('/api/test/feedback', { data: { ids: feedbackIds } })
    await page.request.delete('/api/test/signup', { data: { userId } })
    await page.request.delete('/api/test/session', { data: { email: adminEmail } })
    await page.request.delete('/api/test/session', { data: { email: userEmail } })
  })

  async function openUserDrawer(page: import('@playwright/test').Page) {
    await page.goto('/admin')
    await page.waitForLoadState('networkidle')
    await page.getByLabel('Поиск пользователей').fill(USER_NAME)
    await page.locator('tr').filter({ hasText: USER_NAME }).click()
    await expect(page.getByRole('dialog', { name: /карточка пользователя/i })).toBeVisible()
    await expect(page.getByRole('dialog')).toContainText(USER_NAME, { timeout: 15_000 })
  }

  test('поиск открывает drawer со всеми секциями пользователя', async ({ page }) => {
    await openUserDrawer(page)

    await expect(page.getByRole('dialog')).toContainText(USER_CONTACT)
    await expect(page.getByRole('dialog')).toContainText('Профиль')
    await expect(page.getByRole('dialog')).toContainText('Записи на книги')
    await expect(page.getByRole('dialog')).toContainText('Предложения книг')
    await expect(page.getByRole('dialog')).toContainText('Фидбеки')
    await expect(page.getByRole('dialog')).toContainText(BOOK_A)
    await expect(page.getByRole('dialog')).toContainText(registeredFeedback)
  })

  test('снятие записи на книгу сохраняется после reload', async ({ page }) => {
    await openUserDrawer(page)

    page.on('dialog', dialog => dialog.accept())
    const bookPill = page.getByRole('dialog').locator('span').filter({ hasText: BOOK_B }).first()
    await bookPill.getByTitle('Снять запись').click()

    await expect.poll(async () => {
      const state = await (await page.request.get(`/api/test/user?email=${encodeURIComponent(userEmail)}`)).json()
      return state.signupBooks.sort()
    }).toEqual([BOOK_A])

    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.getByLabel('Поиск пользователей').fill(USER_NAME)
    await expect(page.locator('tr').filter({ hasText: USER_NAME })).toContainText('1')
  })

  test('удаление пользователя закрывает drawer и убирает строку', async ({ page }) => {
    await openUserDrawer(page)

    page.on('dialog', dialog => dialog.accept())
    await page.getByRole('dialog').getByRole('button', { name: /удалить пользователя/i }).click()

    await expect(page.getByRole('dialog')).toHaveCount(0, { timeout: 10_000 })
    await expect(page.locator('tr').filter({ hasText: USER_NAME })).toHaveCount(0)
  })

  test('вкладка фидбеков показывает фильтры, поиск и открывает пользователя', async ({ page }) => {
    await page.goto('/admin')
    await page.waitForLoadState('networkidle')
    const feedbackTab = page.locator('button').filter({ hasText: /фидбеки/i }).first()
    await expect(feedbackTab).toBeVisible()
    let feedbackCount = 0
    await expect.poll(async () => {
      feedbackCount = Number((await feedbackTab.textContent())?.match(/Фидбеки \((\d+)\)/i)?.[1] ?? 0)
      return feedbackCount
    }).toBeGreaterThanOrEqual(2)
    await expect(feedbackTab.getByLabel(`${feedbackCount} новых`)).toBeVisible()

    await page.getByRole('button', { name: /фидбеки/i }).click()
    await expect(feedbackTab.getByLabel(/новых/)).not.toBeVisible()

    await expect(page.getByText(registeredFeedback)).toBeVisible()
    await expect(page.getByText(anonFeedback)).toBeVisible()

    await page.getByRole('button', { name: /анонимные/i }).click()
    await expect(page.getByText(anonFeedback)).toBeVisible()
    await expect(page.getByText(registeredFeedback)).not.toBeVisible()

    await page.getByRole('button', { name: /все/i }).click()
    await page.getByLabel('Поиск фидбеков').fill(registeredFeedback)
    await expect(page.getByText(registeredFeedback)).toBeVisible()
    await expect(page.getByText(anonFeedback)).not.toBeVisible()

    await page.getByRole('button', { name: USER_NAME }).click()
    await expect(page.getByRole('dialog')).toContainText(userEmail)
  })
})
