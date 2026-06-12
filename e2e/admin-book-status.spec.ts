import { test, expect } from './fixtures'
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

test.describe('AdminPanel — изменение статуса книги', () => {
  test.setTimeout(120_000) // Админка и e2e setup могут быть медленными в CI

  test.beforeEach(async () => {
    await epic('Администрирование')
    await feature('Статус книги')
  })

  test.afterEach(async ({ page }) => {
    // Снимаем все тестовые сессии. Книги (и каскадно — signups) удалит
    // фикстура createTestBook в teardown.
    await page.request.delete('/api/test/session', { data: { email: ADMIN_EMAIL } })
    await page.request.delete('/api/test/session', { data: { email: USER_EMAIL } })
    await page.request.delete('/api/test/session', { data: { email: SORT_USER_A_EMAIL } })
    await page.request.delete('/api/test/session', { data: { email: SORT_USER_B_EMAIL } })
  })

  test('изменение статуса книги на "Читаем" сохраняется после перезагрузки', async ({ page, createTestBook }) => {
    const book = await createTestBook({ tags: ['государство'] })

    // 1. Подписываем пользователя на книгу
    await page.request.post('/api/test/session', {
      data: { email: USER_EMAIL, name: USER_NAME },
    })
    await page.request.post('/api/test/signup', {
      data: {
        userId: USER_ID,
        name: USER_NAME,
        email: USER_EMAIL,
        contacts: USER_CONTACT,
        selectedBookIds: [book.id],
      },
    })

    // 2. Логинимся как админ
    await page.request.post('/api/test/session', {
      data: { email: ADMIN_EMAIL, name: ADMIN_NAME, isAdmin: true },
    })

    await page.goto('/admin')
    await page.waitForLoadState('networkidle')

    // Переключаемся на вкладку "Каталог"
    await page.getByTestId('admin-tab-catalog').click()
    // НЕ networkidle: каталог рендерит обложки через next/image; недоступный
    // внешний хост (imwerden.de) держит запрос /_next/image открытым и idle
    // никогда не наступает. Дальнейшие expect(...).toBeVisible() сами ждут гидрацию.
    await page.waitForLoadState('domcontentloaded')

    // Находим строку нашей книги
    const bookRow = page.getByTestId(`admin-book-row-${book.id}`)
    await expect(bookRow).toBeVisible()

    // Открываем inline-editor и кликаем Reading
    await page.getByTestId(`admin-book-expand-${book.id}`).click()
    const editor = page.getByTestId(`admin-book-editor-${book.id}`)
    await expect(editor).toBeVisible()
    const statusPatch = page.waitForResponse(
      r => r.url().includes(`/api/admin/books/${book.id}`) && r.request().method() === 'PATCH',
    )
    await editor.getByRole('button', { name: 'Reading' }).click()
    const statusPatchResponse = await statusPatch
    expect(statusPatchResponse.ok()).toBe(true)

    await expect(bookRow).toContainText('Reading')

    // Ключевая проверка: перезагрузка → статус должен сохраниться.
    // После reload восстанавливается ?tab=catalog, поэтому ждём только
    // domcontentloaded (см. коммент выше про обложки и networkidle).
    await page.reload()
    await page.waitForLoadState('domcontentloaded')
    await page.getByTestId('admin-tab-catalog').click()

    const bookRowAfterReload = page.getByTestId(`admin-book-row-${book.id}`)
    await expect(bookRowAfterReload).toBeVisible()
    await expect(bookRowAfterReload).toContainText('Reading')
  })

  test('[SEC] обычный пользователь не может изменить статус книги', async ({ page, createTestBook }) => {
    const book = await createTestBook()
    await page.request.post('/api/test/session', {
      data: { email: USER_EMAIL, name: USER_NAME },
    })

    const res = await page.request.patch(`/api/admin/books/${encodeURIComponent(book.id)}`, {
      data: { readingStatus: 'reading' },
    })

    expect(res.status()).toBe(403)
  })

  test('таблица по книгам сортируется по числу записей и названию', async ({ page, createTestBook }) => {
    // Две свои книги. book1 в алфавите идёт раньше book2 — чтобы проверить
    // переключение сортировки.
    const book1 = await createTestBook({ title: 'AAA Book sort-low' })
    const book2 = await createTestBook({ title: 'ZZZ Book sort-high' })

    // На book1 один читатель, на book2 — два. По умолчанию таблица сортируется
    // по числу записей убыванием → book2 должна быть выше book1.
    await page.request.post('/api/test/session', {
      data: { email: SORT_USER_A_EMAIL, name: 'E2E Sort Reader A' },
    })
    await page.request.post('/api/test/signup', {
      data: {
        userId: `test:${SORT_USER_A_EMAIL}`,
        name: 'E2E Sort Reader A',
        email: SORT_USER_A_EMAIL,
        contacts: '@e2e_sort_a',
        selectedBookIds: [book1.id, book2.id],
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
        selectedBookIds: [book2.id],
      },
    })

    await page.request.post('/api/test/session', {
      data: { email: ADMIN_EMAIL, name: ADMIN_NAME, isAdmin: true },
    })

    await page.goto('/admin')
    await page.waitForLoadState('networkidle')
    await page.getByTestId('admin-tab-catalog').click()

    const dataRows = page.getByTestId('admin-catalog-section-published').locator('tbody tr')

    // Сортировка по умолчанию — book2 (2 записи) идёт раньше book1 (1 запись)
    await expect.poll(async () => {
      const rows = await dataRows.allTextContents()
      return rows.findIndex(r => r.includes(book2.title)) < rows.findIndex(r => r.includes(book1.title))
    }).toBe(true)

    // Кликаем на заголовок "Книга" — сортировка по названию (A..Z)
    await page
      .getByTestId('admin-catalog-section-published')
      .getByRole('columnheader', { name: /^книга/i })
      .first()
      .click()
    await expect.poll(async () => {
      const rows = await dataRows.allTextContents()
      return rows.findIndex(r => r.includes(book1.title)) < rows.findIndex(r => r.includes(book2.title))
    }).toBe(true)
  })
})
