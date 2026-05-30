import { test, expect } from './fixtures'
import { epic, feature } from 'allure-js-commons'

const ADMIN_EMAIL = 'e2e-admin-book-status@test.invalid'
const USER_EMAIL  = 'e2e-user-book-status@test.invalid'
const USER_NAME   = 'E2E BookStatus User'
const TG          = 'e2e_bookstatus_tg'
const USER_ID     = `test:${USER_EMAIL}`

test.describe('Admin: смена personalStatus книги за пользователя', () => {
  test.setTimeout(90_000)

  test.beforeEach(async () => {
    await epic('Admin')
    await feature('Смена статуса книги')
  })

  test('админ переводит книгу в «Читаю» — книга уходит в секцию Читаю, статус сохраняется после reload', async ({ page, createTestBook }) => {
    const book = await createTestBook({ title: 'E2E Admin Status Book' })

    await page.request.post('/api/test/session', {
      data: { email: USER_EMAIL, name: USER_NAME, telegramUsername: TG, provider: 'telegram-preauth' },
    })
    await page.request.post('/api/test/signup', {
      data: { userId: USER_ID, name: USER_NAME, email: USER_EMAIL, contacts: '@' + TG, telegramUsername: TG, selectedBookIds: [book.id] },
    })
    await page.request.post('/api/test/session', {
      data: { email: ADMIN_EMAIL, name: 'E2E Admin', isAdmin: true },
    })

    try {
      await page.goto('/admin')
      await page.waitForLoadState('networkidle')

      // Открыть drawer пользователя
      await page.getByLabel('Поиск пользователей').fill(USER_NAME)
      await page.locator('tr').filter({ hasText: USER_NAME }).click()
      const drawer = page.getByRole('dialog')
      await expect(drawer).toBeVisible()

      // Меню закрыто — кнопки статуса не видны
      await expect(drawer.locator('[data-testid="admin-status-option-null"]')).toHaveCount(0)

      // Найти кнопку с названием книги и кликнуть на неё
      const chip = drawer.locator('button', { hasText: book.title })
      await expect(chip).toBeVisible()
      await chip.click()

      // Меню открылось
      await expect(drawer.locator('[data-testid="admin-status-option-reading"]')).toBeVisible()

      // Выбрать «Читаю»
      const patchDone = page.waitForResponse(r =>
        r.url().includes('/api/admin/signup-books') && r.request().method() === 'PATCH'
      )
      await drawer.locator('[data-testid="admin-status-option-reading"]').click()
      await patchDone
      await page.waitForLoadState('networkidle')

      // Книга должна быть в секции «Читаю» (заголовок секции виден)
      await expect(drawer.locator('text=Читаю').first()).toBeVisible()
      // Чип книги всё ещё виден
      await expect(drawer.locator('button', { hasText: book.title })).toBeVisible()

      // Проверить персистентность через API
      const userState = await (await page.request.get(
        `/api/test/user?telegramUsername=${encodeURIComponent(TG)}`
      )).json()
      const entry = (userState.signups as { bookId: string; personalStatus: string | null }[])
        .find(s => s.bookId === book.id)
      expect(entry?.personalStatus).toBe('reading')
    } finally {
      await page.request.delete('/api/test/session', { data: { email: ADMIN_EMAIL } })
      await page.request.delete('/api/test/session', {
        data: { email: USER_EMAIL, provider: 'telegram-preauth', telegramUsername: TG },
      })
      await page.request.delete('/api/test/signup', { data: { userId: USER_ID } })
    }
  })
})
