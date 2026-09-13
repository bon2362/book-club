import { epic, feature } from 'allure-js-commons'
import { expect, test } from './fixtures'

test.beforeEach(async () => { await epic('Подборки'); await feature('Автор и читатель') })
async function contacts(page: import('@playwright/test').Page, name: string) { expect((await page.request.patch('/api/profile', { data: { name, contacts: '@e2e_collections' }, timeout: 15_000 })).ok()).toBeTruthy() }

test('автор создаёт черновик, автосохранение переживает reload и подборка уходит на проверку', async ({ page, loginAsUser, createTestBook, trackCollection }) => {
  const books = [await createTestBook(), await createTestBook()]; await loginAsUser(); await page.goto('/collections/new')
  await page.getByLabel('Название').fill('E2E черновик подборки'); await expect(page.getByTestId('collection-save-state')).toHaveText('Сохранено', { timeout: 15_000 }); await expect(page).toHaveURL(/\/collections\/[^/]+\/edit$/)
  const id = page.url().match(/collections\/([^/]+)\/edit/)![1]; trackCollection(id); await page.reload(); await expect(page.getByLabel('Название')).toHaveValue('E2E черновик подборки')
  for (const book of books) { await page.getByPlaceholder('Найти книгу по названию или автору').fill(book.title); await page.getByRole('option', { name: new RegExp(book.title) }).click() }
  await page.getByTestId('collection-book-row').nth(1).getByRole('button', { name: 'Выше' }).click(); await expect(page.getByTestId('collection-book-row').first()).toContainText(books[1].title)
  const saved = page.waitForResponse(response => response.url().includes(`/api/me/collections/${id}`) && response.request().method() === 'PATCH' && (response.request().postData() ?? '').includes(books[1].id), { timeout: 15_000 })
  await page.getByLabel('Описание').fill('Зачем это читать вместе'); await page.getByLabel('Подпись').fill('E2E Автор'); await saved; await expect(page.getByTestId('collection-save-state')).toHaveText('Сохранено', { timeout: 15_000 }); await page.reload(); await expect(page.getByTestId('collection-book-row').first()).toContainText(books[1].title)
  await page.getByRole('button', { name: 'Отправить на проверку' }).click(); await expect(page.getByTestId('collection-status-banner')).toContainText('На проверке', { timeout: 15_000 }); await page.reload(); await expect(page.getByTestId('collection-status-banner')).toContainText('На проверке')
})

test('гость видит только публичные книги без статусов клуба', async ({ browser, loginAsUser, createTestBook, createTestCollection, dbExec }) => {
  const [read, reading, hidden] = [await createTestBook(), await createTestBook(), await createTestBook()]; await dbExec("update books set reading_status = 'read' where id = $1", [read.id]); await dbExec("update books set reading_status = 'reading' where id = $1", [reading.id]); const author = await loginAsUser(); const collection = await createTestCollection({ authorUserId: author.userId, bookIds: [read.id, reading.id, hidden.id] }); await dbExec("update books set visibility = 'hidden' where id = $1", [hidden.id])
  const guest = await browser.newContext(); const guestPage = await guest.newPage(); await guestPage.goto(collection.url); const main = guestPage.locator('main.collection-page'); await expect(main.getByRole('heading', { name: collection.title })).toBeVisible(); await expect(main.locator('.catalog-desktop [data-testid="collection-item"]')).toHaveCount(2); await expect(main.getByText('Прочитано')).toHaveCount(0); await expect(main.getByText('Сейчас читаем')).toHaveCount(0); await expect(main.getByText(hidden.title)).toHaveCount(0); await guest.close()
})

test('запись из подборки сохраняет прежние книги', async ({ page, loginAsUser, createTestBook, createTestCollection, dbExec }) => {
  const [earlier, target, other] = [await createTestBook(), await createTestBook(), await createTestBook()]; const user = await loginAsUser(); await contacts(page, user.name); expect((await page.request.post(`/api/signup-books/${earlier.id}`, { timeout: 15_000 })).ok()).toBeTruthy(); const collection = await createTestCollection({ authorUserId: user.userId, bookIds: [target.id, other.id] }); await page.goto(collection.url); const card = page.locator('.catalog-desktop article').filter({ hasText: target.title }); await Promise.all([page.waitForResponse(res => res.url().includes(`/api/signup-books/${target.id}`) && res.request().method() === 'POST', { timeout: 15_000 }), card.getByRole('button', { name: /хочу читать/i }).click()]); await page.reload(); await expect(card.getByRole('button', { name: /В вашем списке/ })).toBeVisible(); const rows = await dbExec('select book_id from signup_books where user_id = $1', [user.userId]) as Array<{ book_id: string }>; expect(rows.map(row => row.book_id).sort()).toEqual([earlier.id, target.id].sort())
})

test('намерение гостя записывает книгу после входа', async ({ page, loginAsUser, createTestBook, createTestCollection }) => {
  const [first, second] = [await createTestBook(), await createTestBook()]; const author = await loginAsUser(); const collection = await createTestCollection({ authorUserId: author.userId, bookIds: [first.id, second.id] }); await page.context().clearCookies(); await page.goto(collection.url); await page.locator('.catalog-desktop article').filter({ hasText: second.title }).getByRole('button', { name: /хочу читать/i }).click(); await expect(page.getByRole('dialog')).toBeVisible(); const reader = await loginAsUser(); await contacts(page, reader.name); await page.goto(collection.url); const button = page.locator('.catalog-desktop article').filter({ hasText: second.title }).getByRole('button', { name: /В вашем списке/ }); await expect(button).toBeVisible({ timeout: 15_000 }); await page.reload(); await expect(button).toBeVisible()
})

test('автор не может удалить опубликованную подборку', async ({ page, loginAsUser, createTestBook, createTestCollection }) => {
  const books = [await createTestBook(), await createTestBook()]; const author = await loginAsUser(); const collection = await createTestCollection({ authorUserId: author.userId, bookIds: books.map(book => book.id) }); await page.goto(`/collections/${collection.id}/edit`); await expect(page.getByRole('button', { name: 'Опубликовать правки' })).toBeVisible(); await expect(page.getByRole('button', { name: 'Удалить подборку' })).toHaveCount(0); expect((await page.request.delete(`/api/me/collections/${collection.id}`)).status()).toBe(403)
})

test('правки опубликованной видны читателю только после публикации', async ({ browser, page, loginAsUser, createTestBook, createTestCollection }) => {
  const books = [await createTestBook(), await createTestBook()]; const author = await loginAsUser(); const collection = await createTestCollection({ authorUserId: author.userId, bookIds: books.map(book => book.id), description: 'Старое описание' }); const guest = await browser.newContext(); const guestPage = await guest.newPage(); await page.goto(`/collections/${collection.id}/edit`); await page.getByLabel('Описание').fill('Новое описание'); await guestPage.goto(collection.url); await expect(guestPage.locator('main.collection-page')).toContainText('Старое описание'); await Promise.all([page.waitForResponse(res => res.url().endsWith(`/api/me/collections/${collection.id}`) && res.request().method() === 'PATCH', { timeout: 15_000 }), page.getByRole('button', { name: 'Опубликовать правки' }).click()]); await guestPage.reload(); await expect(guestPage.locator('main.collection-page')).toContainText('Новое описание'); await guest.close()
})

test('OG-картинка опубликованной подборки отдаётся как PNG', async ({ page, loginAsUser, createTestBook, createTestCollection }) => {
  const books = [await createTestBook(), await createTestBook()]; const author = await loginAsUser(); const collection = await createTestCollection({ authorUserId: author.userId, bookIds: books.map(book => book.id) }); const response = await page.request.get(`/api/og/collections/${collection.slug}`); expect(response.status()).toBe(200); expect(response.headers()['content-type']).toContain('image/png')
})
