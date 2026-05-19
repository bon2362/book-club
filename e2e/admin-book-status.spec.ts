import { test, expect } from '@playwright/test'
import { epic, feature } from 'allure-js-commons'

const ADMIN_EMAIL = 'e2e-bookstatus-admin@test.invalid'
const ADMIN_NAME = 'E2E Book Status Admin'
// Тестовый пользователь, который записывается на книгу
const USER_EMAIL = 'e2e-bookstatus-user@test.invalid'
const USER_NAME = 'E2E BookStatus User'
const USER_ID = `test:${USER_EMAIL}`
const USER_CONTACT = '@e2e_bookstatus_user'
const SORT_USER_A_EMAIL = 'e2e-bookstatus-sort-a@test.invalid'
const SORT_USER_B_EMAIL = 'e2e-bookstatus-sort-b@test.invalid'
const SORT_EXTRA_EMAIL_PREFIX = 'e2e-bookstatus-sort-extra'
// Фикстурная книга из lib/books-with-covers.ts (только в NEXTAUTH_TEST_MODE)
const TEST_BOOK_NAME = 'Тестовая книга 1'
const TEST_BOOK_ID = '__test_book_1__'
const TEST_BOOK_3_NAME = 'Тестовая книга 3'

test.describe('AdminPanel — изменение статуса книги', () => {
  test.setTimeout(120_000) // Админка и e2e setup могут быть медленными в CI
  let sortExtraEmails: string[] = []

  test.beforeEach(async ({ page }) => {
    await epic('Администрирование')
    await feature('Статус книги')
    sortExtraEmails = []
    // 1. Создаём обычного пользователя, записавшегося на тестовую книгу
    //    Пишем напрямую в signup_books через /api/test/signup,
    //    чтобы компактно подготовить фикстуру для админки.
    await page.request.post('/api/test/session', {
      data: { email: USER_EMAIL, name: USER_NAME },
    })
    await page.request.post('/api/test/signup', {
      data: {
        userId: USER_ID,
        name: USER_NAME,
        email: USER_EMAIL,
        contacts: USER_CONTACT,
        selectedBooks: [TEST_BOOK_NAME],
      },
    })

    // 2. Переключаемся на сессию администратора
    await page.request.post('/api/test/session', {
      data: { email: ADMIN_EMAIL, name: ADMIN_NAME, isAdmin: true },
    })
  })

  test.afterEach(async ({ page }) => {
    await page.request.post('/api/test/session', {
      data: { email: ADMIN_EMAIL, name: ADMIN_NAME, isAdmin: true },
    })

    // Сбрасываем статус книги (чтобы не влиять на другие тесты)
    await page.request.delete(`/api/admin/book-status?bookId=${encodeURIComponent(TEST_BOOK_ID)}`)

    // Чистим signup_books запись пользователя
    await page.request.delete('/api/test/signup', { data: { userId: USER_ID } })
    await page.request.delete('/api/test/signup', { data: { userId: `test:${SORT_USER_A_EMAIL}` } })
    await page.request.delete('/api/test/signup', { data: { userId: `test:${SORT_USER_B_EMAIL}` } })
    for (const email of sortExtraEmails) {
      await page.request.delete('/api/test/signup', { data: { userId: `test:${email}` } })
    }

    // Удаляем пользователей из БД
    await page.request.delete('/api/test/session', { data: { email: ADMIN_EMAIL } })
    await page.request.delete('/api/test/session', { data: { email: USER_EMAIL } })
    await page.request.delete('/api/test/session', { data: { email: SORT_USER_A_EMAIL } })
    await page.request.delete('/api/test/session', { data: { email: SORT_USER_B_EMAIL } })
    for (const email of sortExtraEmails) {
      await page.request.delete('/api/test/session', { data: { email } })
    }
  })

  async function addSortSignup(page: import('@playwright/test').Page, email: string, index: number) {
    const name = `E2E Sort Reader Extra ${index}`
    await page.request.post('/api/test/session', {
      data: { email, name },
    })
    await page.request.post('/api/test/signup', {
      data: {
        userId: `test:${email}`,
        name,
        email,
        contacts: `@e2e_sort_extra_${index}`,
        selectedBooks: [TEST_BOOK_3_NAME],
      },
    })
  }

  async function getBookSignupCount(page: import('@playwright/test').Page, bookName: string) {
    const row = page.locator('tbody tr').filter({ hasText: bookName })
    await expect(row).toBeVisible()
    const text = await row.locator('td').nth(1).innerText()
    return Number.parseInt(text, 10)
  }

  test('изменение статуса книги на "Читаем" сохраняется после перезагрузки', async ({ page }) => {
    await page.goto('/admin')
    await page.waitForLoadState('networkidle')

    // Переключаемся на вкладку "По книгам"
    await page.getByRole('button', { name: /по книгам/i }).click()
    await page.waitForLoadState('networkidle')

    // Находим строку тестовой книги
    const bookRow = page.locator('tr').filter({ hasText: TEST_BOOK_NAME })
    await expect(bookRow).toBeVisible()

    // Кликаем "Читаем" в строке книги
    await bookRow.getByRole('button', { name: 'Читаем' }).click()

    // Ждём появления кнопки "Сброс" — она появляется только после того,
    // как API-вызов завершился и React-стейт обновился (currentStatus установлен)
    await expect(bookRow.getByRole('button', { name: 'Сброс' })).toBeVisible()

    // Ключевая проверка: перезагрузка → статус должен сохраниться
    await page.reload()
    await page.waitForLoadState('networkidle')

    // Переходим на вкладку "По книгам" снова
    await page.getByRole('button', { name: /по книгам/i }).click()

    // Строка книги всё ещё видна, "Сброс" присутствует → статус сохранён в БД
    const bookRowAfterReload = page.locator('tr').filter({ hasText: TEST_BOOK_NAME })
    await expect(bookRowAfterReload).toBeVisible()
    await expect(bookRowAfterReload.getByRole('button', { name: 'Сброс' })).toBeVisible()
  })

  test('[SEC] обычный пользователь не может изменить статус книги', async ({ page }) => {
    // Переключаем на обычного пользователя (не админ)
    await page.request.post('/api/test/session', {
      data: { email: USER_EMAIL, name: USER_NAME },
    })

    const res = await page.request.post('/api/admin/book-status', {
      data: { bookId: TEST_BOOK_ID, status: 'reading' },
    })

    expect(res.status()).toBe(403)
  })

  test('таблица по книгам сортируется по числу записей и названию', async ({ page }) => {
    await page.request.post('/api/test/session', {
      data: { email: SORT_USER_A_EMAIL, name: 'E2E Sort Reader A' },
    })
    await page.request.post('/api/test/signup', {
      data: {
        userId: `test:${SORT_USER_A_EMAIL}`,
        name: 'E2E Sort Reader A',
        email: SORT_USER_A_EMAIL,
        contacts: '@e2e_sort_a',
        selectedBooks: [TEST_BOOK_3_NAME],
      },
    })
    await page.request.post('/api/test/session', {
      data: { email: SORT_USER_B_EMAIL, name: 'E2E Sort Reader B' },
    })
    await page.request.post('/api/test/signup', {
      data: {
        userId: `test:${SORT_USER_B_EMAIL}`,
        name: 'E2E Sort Reader B',
        email: SORT_USER_B_EMAIL,
        contacts: '@e2e_sort_b',
        selectedBooks: [TEST_BOOK_3_NAME],
      },
    })
    await page.request.post('/api/test/session', {
      data: { email: ADMIN_EMAIL, name: ADMIN_NAME, isAdmin: true },
    })

    await page.goto('/admin')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: /по книгам/i }).click()

    const book1Count = await getBookSignupCount(page, TEST_BOOK_NAME)
    const book3Count = await getBookSignupCount(page, TEST_BOOK_3_NAME)
    const extrasNeeded = Math.max(0, book1Count - book3Count + 1)
    for (let i = 0; i < extrasNeeded; i += 1) {
      const email = `${SORT_EXTRA_EMAIL_PREFIX}-${i}@test.invalid`
      sortExtraEmails.push(email)
      await addSortSignup(page, email, i)
    }
    if (extrasNeeded > 0) {
      // addSortSignup switches session to non-admin; restore admin before reload
      await page.request.post('/api/test/session', {
        data: { email: ADMIN_EMAIL, name: ADMIN_NAME, isAdmin: true },
      })
      await page.reload()
      await page.waitForLoadState('networkidle')
      await page.getByRole('button', { name: /по книгам/i }).click()
    }

    const dataRows = page.locator('tbody tr')
    await expect.poll(async () => {
      const rows = await dataRows.allTextContents()
      return rows.findIndex(row => row.includes(TEST_BOOK_3_NAME)) < rows.findIndex(row => row.includes(TEST_BOOK_NAME))
    }).toBe(true)

    await page.getByRole('columnheader', { name: /^книга/i }).click()
    await expect.poll(async () => {
      const rows = await dataRows.allTextContents()
      return rows.findIndex(row => row.includes(TEST_BOOK_NAME)) < rows.findIndex(row => row.includes(TEST_BOOK_3_NAME))
    }).toBe(true)
  })
})
