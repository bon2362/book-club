import { test, expect } from './fixtures'
import { epic, feature } from 'allure-js-commons'

const ADMIN_EMAIL = 'e2e-books-catalog-admin@test.invalid'
const ADMIN_NAME = 'E2E Books Catalog Admin'

const BOOK_TITLE = `E2E Catalog Book ${Date.now()}`
const BOOK_AUTHOR = 'E2E Author'

test.describe('AdminPanel — вкладка «Каталог»', () => {
  test.setTimeout(120_000)
  let createdBookId: string | null = null

  test.beforeEach(async ({ page }) => {
    await epic('Администрирование')
    await feature('Каталог книг')
    await page.request.post('/api/test/session', {
      data: { email: ADMIN_EMAIL, name: ADMIN_NAME, isAdmin: true },
    })
  })

  test.afterEach(async ({ page }) => {
    await page.request.post('/api/test/session', {
      data: { email: ADMIN_EMAIL, name: ADMIN_NAME, isAdmin: true },
    })
    if (createdBookId) {
      // Soft-archive instead of hard delete to keep history; cleanup script may purge later.
      await page.request.patch(`/api/admin/books/${createdBookId}`, {
        data: { archived: true, visibility: 'hidden' },
      })
      createdBookId = null
    }
    await page.request.delete('/api/test/session', { data: { email: ADMIN_EMAIL } })
  })

  test('создание скрытой книги, публикация, скрытие и архив сохраняются после перезагрузки', async ({ page }) => {
    await page.goto('/admin')
    await page.waitForLoadState('networkidle')

    await page.getByTestId('admin-tab-catalog').click()
    await expect(page.getByTestId('admin-books-catalog')).toBeVisible()

    // 1. Открыть форму создания и создать скрытую книгу
    await page.getByTestId('admin-books-create-toggle').click()
    const form = page.getByTestId('admin-books-create-form')
    await expect(form).toBeVisible()
    await form.getByLabel('Название').fill(BOOK_TITLE)
    await form.getByRole('textbox').nth(1).fill(BOOK_AUTHOR)

    const createRes = page.waitForResponse(res =>
      res.url().endsWith('/api/admin/books') && res.request().method() === 'POST'
    )
    await page.getByTestId('admin-books-create-submit').click()
    const created = await createRes
    expect(created.ok()).toBe(true)
    const createdBody = await created.json()
    createdBookId = createdBody.data.id as string
    expect(createdBookId).toBeTruthy()

    // 2. Книга появляется в таблице, по умолчанию скрыта
    const row = page.getByTestId(`admin-book-row-${createdBookId}`)
    await expect(row).toBeVisible()
    await expect(row).toContainText(BOOK_TITLE)
    await expect(row).toContainText('Скрыта')

    // 3. На главной hidden книги нет
    const homePage = await page.context().newPage()
    await homePage.goto('/')
    await homePage.waitForLoadState('networkidle')
    await expect(homePage.getByText(BOOK_TITLE)).toHaveCount(0)
    await homePage.close()

    // 4. Публикуем книгу
    await row.locator('button').first().click()
    await page.getByTestId('admin-book-toggle-publish').click()
    await expect(row).toContainText('Опубликована', { timeout: 5000 })

    // Reload — должна остаться опубликованной
    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.getByTestId('admin-tab-catalog').click()
    const rowAfterPublish = page.getByTestId(`admin-book-row-${createdBookId}`)
    await expect(rowAfterPublish).toContainText('Опубликована')

    // 5. На главной книга появилась
    const homePage2 = await page.context().newPage()
    await homePage2.goto('/')
    await homePage2.waitForLoadState('networkidle')
    await expect(homePage2.getByText(BOOK_TITLE).first()).toBeVisible()
    await homePage2.close()

    // 6. Скрываем
    await rowAfterPublish.locator('button').first().click()
    await page.getByTestId('admin-book-toggle-publish').click()
    await expect(rowAfterPublish).toContainText('Скрыта', { timeout: 5000 })

    // Reload — скрыта осталась
    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.getByTestId('admin-tab-catalog').click()
    const rowAfterHide = page.getByTestId(`admin-book-row-${createdBookId}`)
    await expect(rowAfterHide).toContainText('Скрыта')

    // На главной снова нет
    const homePage3 = await page.context().newPage()
    await homePage3.goto('/')
    await homePage3.waitForLoadState('networkidle')
    await expect(homePage3.getByText(BOOK_TITLE)).toHaveCount(0)
    await homePage3.close()

    // 7. Архивируем (soft delete)
    page.on('dialog', d => d.accept())
    await rowAfterHide.locator('button').first().click()
    await page.getByTestId('admin-book-archive-toggle').click()

    // Книга пропала из активного фильтра по умолчанию
    await expect(page.getByTestId(`admin-book-row-${createdBookId}`)).toHaveCount(0, { timeout: 5000 })

    // Но видна в фильтре «Архив»
    await page.getByRole('button', { name: 'Архив' }).click()
    await expect(page.getByTestId(`admin-book-row-${createdBookId}`)).toBeVisible()
  })

  test('[SEC] не-админ не может вызвать /api/admin/books', async ({ page }) => {
    const userEmail = 'e2e-books-catalog-user@test.invalid'
    await page.request.post('/api/test/session', {
      data: { email: userEmail, name: 'E2E User' },
    })
    const getRes = await page.request.get('/api/admin/books')
    expect(getRes.status()).toBe(403)
    const postRes = await page.request.post('/api/admin/books', {
      data: { title: 'Sneaky' },
    })
    expect(postRes.status()).toBe(403)
    await page.request.delete('/api/test/session', { data: { email: userEmail } })
  })
})
