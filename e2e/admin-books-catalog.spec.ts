import { test, expect } from './fixtures'
import { epic, feature } from 'allure-js-commons'

const ADMIN_EMAIL = 'e2e-books-catalog-admin@test.invalid'
const ADMIN_NAME = 'E2E Books Catalog Admin'

const BOOK_TITLE = `E2E Catalog Book ${Date.now()}`
const BOOK_AUTHOR = 'E2E Author'

async function ensureEditorOpen(page: import('@playwright/test').Page, bookId: string) {
  const editor = page.getByTestId(`admin-book-editor-${bookId}`)
  if (!(await editor.isVisible().catch(() => false))) {
    await page.getByTestId(`admin-book-expand-${bookId}`).click()
    await expect(editor).toBeVisible()
  }
}

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
      await page.request.patch(`/api/admin/books/${createdBookId}`, {
        data: { visibility: 'hidden' },
      })
      createdBookId = null
    }
    await page.request.delete('/api/test/session', { data: { email: ADMIN_EMAIL } })
  })

  test('создание скрытой книги, публикация и скрытие сохраняются после перезагрузки', async ({ page }) => {
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

    // 2. Книга появляется в секции «Не опубликованные»
    const row = page.getByTestId(`admin-book-row-${createdBookId}`)
    await expect(row).toBeVisible()
    await expect(row).toContainText(BOOK_TITLE)

    // 3. На главной hidden книги нет
    const homePage = await page.context().newPage()
    await homePage.goto('/')
    await homePage.waitForLoadState('networkidle')
    await expect(homePage.getByText(BOOK_TITLE)).toHaveCount(0)
    await homePage.close()

    // 4. Публикуем книгу — раскрываем editor и кликаем visibility toggle
    const togglePublishRes = page.waitForResponse(res =>
      res.url().includes(`/api/admin/books/${createdBookId}`) && res.request().method() === 'PATCH'
    )
    await ensureEditorOpen(page, createdBookId)
    await page.getByTestId('admin-book-toggle-publish').click()
    await togglePublishRes

    // После публикации книга переезжает в секцию «Опубликованные»
    const publishedSection = page.getByTestId('admin-catalog-section-published')
    await expect(publishedSection.getByTestId(`admin-book-row-${createdBookId}`)).toBeVisible({ timeout: 5000 })

    // Reload — должна остаться опубликованной
    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.getByTestId('admin-tab-catalog').click()
    await expect(
      page.getByTestId('admin-catalog-section-published').getByTestId(`admin-book-row-${createdBookId}`)
    ).toBeVisible({ timeout: 5000 })

    // 5. На главной книга появилась
    const homePage2 = await page.context().newPage()
    await homePage2.goto('/')
    await homePage2.waitForLoadState('networkidle')
    await expect(homePage2.getByText(BOOK_TITLE).first()).toBeVisible()
    await homePage2.close()

    // 6. Скрываем — раскрываем editor заново после reload
    await ensureEditorOpen(page, createdBookId)
    const hideRes = page.waitForResponse(res =>
      res.url().includes(`/api/admin/books/${createdBookId}`) && res.request().method() === 'PATCH'
    )
    await page.getByTestId('admin-book-toggle-publish').click()
    await hideRes

    // Книга переехала в «Не опубликованные»
    await expect(
      page.getByTestId('admin-catalog-section-hidden').getByTestId(`admin-book-row-${createdBookId}`)
    ).toBeVisible({ timeout: 5000 })

    // Reload — скрыта осталась
    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.getByTestId('admin-tab-catalog').click()
    await expect(
      page.getByTestId('admin-catalog-section-hidden').getByTestId(`admin-book-row-${createdBookId}`)
    ).toBeVisible({ timeout: 5000 })

    // На главной снова нет
    const homePage3 = await page.context().newPage()
    await homePage3.goto('/')
    await homePage3.waitForLoadState('networkidle')
    await expect(homePage3.getByText(BOOK_TITLE)).toHaveCount(0)
    await homePage3.close()

    // Архива больше нет: hidden — единственное состояние скрытия книги от каталога.
    await expect(page.getByTestId('admin-catalog-section-archived')).toHaveCount(0)
  })

  test('закрытие inline-редактора с несохранёнными правками показывает confirm', async ({ page }) => {
    await page.goto('/admin')
    await page.waitForLoadState('networkidle')
    await page.getByTestId('admin-tab-catalog').click()
    await expect(page.getByTestId('admin-books-catalog')).toBeVisible()

    // Создаём книгу, чтобы было что редактировать
    await page.getByTestId('admin-books-create-toggle').click()
    const form = page.getByTestId('admin-books-create-form')
    await form.getByLabel('Название').fill(`${BOOK_TITLE} confirm`)
    const createRes = page.waitForResponse(res =>
      res.url().endsWith('/api/admin/books') && res.request().method() === 'POST'
    )
    await page.getByTestId('admin-books-create-submit').click()
    const created = await createRes
    createdBookId = (await created.json()).data.id as string

    // Открываем editor, меняем «Название», пытаемся закрыть — должен прийти confirm
    await ensureEditorOpen(page, createdBookId)
    const titleInput = page
      .getByTestId(`admin-book-editor-${createdBookId}`)
      .locator('input')
      .first()
    await titleInput.fill(`${BOOK_TITLE} confirm edited`)

    let dialogMessage = ''
    page.once('dialog', async d => {
      dialogMessage = d.message()
      await d.dismiss()
    })
    await page.getByTestId(`admin-book-expand-${createdBookId}`).click()
    await expect.poll(() => dialogMessage, { timeout: 3000 }).toContain('сохранения')
    // Editor остался открыт после dismiss
    await expect(page.getByTestId(`admin-book-editor-${createdBookId}`)).toBeVisible()
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

    // [SEC] reorder endpoint also admin-only
    const reorderRes = await page.request.put('/api/admin/books/reorder', {
      data: { ids: ['some-id'] },
    })
    expect(reorderRes.status()).toBe(403)

    await page.request.delete('/api/test/session', { data: { email: userEmail } })
  })
})
