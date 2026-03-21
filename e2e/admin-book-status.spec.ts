import { test, expect } from '@playwright/test'

const ADMIN_EMAIL = 'e2e-bookstatus-admin@test.invalid'
const ADMIN_NAME = 'E2E Book Status Admin'
// Тестовый пользователь, который записывается на книгу
const USER_EMAIL = 'e2e-bookstatus-user@test.invalid'
const USER_NAME = 'E2E BookStatus User'
const USER_CONTACT = '@e2e_bookstatus_user'
// Фикстурная книга из lib/books-with-covers.ts (только в NEXTAUTH_TEST_MODE)
const TEST_BOOK_NAME = 'Тестовая книга 1'
const TEST_BOOK_ID = '__test_book_1__'

test.describe('AdminPanel — изменение статуса книги', () => {
  test.setTimeout(120_000) // Google Sheets API может быть медленным

  test.beforeEach(async ({ page }) => {
    // 1. Создаём обычного пользователя, записавшегося на тестовую книгу
    //    Пишем напрямую в Google Sheets через /api/test/signup,
    //    т.к. /api/signup пропускает запись в Sheets в NEXTAUTH_TEST_MODE
    await page.request.post('/api/test/signup', {
      data: {
        userId: USER_EMAIL,
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
    // Сбрасываем статус книги (чтобы не влиять на другие тесты)
    await page.request.delete(`/api/admin/book-status?bookId=${encodeURIComponent(TEST_BOOK_ID)}`)

    // Чистим Sheets запись пользователя
    await page.request.delete('/api/test/signup', { data: { userId: USER_EMAIL } })

    // Удаляем пользователей из БД
    await page.request.delete('/api/test/session', { data: { email: ADMIN_EMAIL } })
    await page.request.delete('/api/test/session', { data: { email: USER_EMAIL } })
  })

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
})
