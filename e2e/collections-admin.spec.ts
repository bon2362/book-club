import { epic, feature } from 'allure-js-commons'
import { expect, test, type Page } from './fixtures'

test.beforeEach(async () => {
  await epic('Администрирование')
  await feature('Модерация подборок')
})

async function openModeration(page: Page) {
  await page.goto('/admin?tab=collections')
  await expect(page.getByTestId('admin-collections')).toBeVisible({ timeout: 15_000 })
}

test('владелец публикует новую подборку, и она остаётся опубликованной после перезагрузки', async ({ page, loginAsUser, loginAsAdmin, createTestBook, createTestCollection }) => {
  const books = [await createTestBook(), await createTestBook()]
  const author = await loginAsUser()
  const collection = await createTestCollection({ authorUserId: author.userId, bookIds: books.map((book) => book.id), status: 'pending' })

  await loginAsAdmin()
  await openModeration(page)
  await page.getByTestId('queue-pending').getByText(collection.title).click()
  await Promise.all([
    page.waitForResponse((response) => response.url().includes(`/api/admin/collections/${collection.id}/actions`), { timeout: 15_000 }),
    page.getByRole('button', { name: 'Опубликовать' }).click(),
  ])

  await page.reload()
  await expect(page.getByTestId('queue-published')).toContainText(collection.title)
})

test('правка после проверки видна разницей и снимается «Правка проверена»', async ({ page, loginAsUser, loginAsAdmin, createTestBook, createTestCollection }) => {
  const [kept, added] = [await createTestBook(), await createTestBook()]
  const author = await loginAsUser()
  const collection = await createTestCollection({
    authorUserId: author.userId,
    bookIds: [kept.id, added.id],
    reviewedBookIds: [kept.id],
    editedAfterReview: true,
  })

  await loginAsAdmin()
  await openModeration(page)
  const changed = page.getByTestId('queue-changed')
  await expect(changed).toContainText(collection.title)
  await expect(changed).toContainText('+1')
  await changed.getByText(collection.title).click()
  await expect(page.getByTestId('diff-added')).toContainText(added.title)

  await Promise.all([
    page.waitForResponse((response) => response.url().includes(`/api/admin/collections/${collection.id}/actions`), { timeout: 15_000 }),
    page.getByRole('button', { name: 'Правка проверена' }).click(),
  ])
  await page.reload()
  await expect(page.getByTestId('queue-changed')).not.toContainText(collection.title)
  await expect(page.getByTestId('queue-published')).toContainText(collection.title)
})

test('перестановка текстов автором не отправляет подборку на проверку', async ({ page, loginAsUser, loginAsAdmin, createTestBook, createTestCollection }) => {
  const [first, second] = [await createTestBook(), await createTestBook()]
  const author = await loginAsUser()
  const collection = await createTestCollection({
    authorUserId: author.userId,
    bookIds: [first.id, second.id],
    displayName: 'E2E Автор',
    description: 'Описание',
  })

  const response = await page.request.patch(`/api/me/collections/${collection.id}`, {
    data: { title: collection.title, descriptionMarkdown: 'Описание', displayName: 'E2E Автор', bookIds: [second.id, first.id] },
    timeout: 15_000,
  })
  expect(response.ok()).toBeTruthy()

  await loginAsAdmin()
  await openModeration(page)
  await expect(page.getByTestId('queue-changed')).not.toContainText(collection.title)
  await expect(page.getByTestId('queue-published')).toContainText(collection.title)
})

test('скрытие с причиной: подборка уходит в скрытые, гость получает 404', async ({ browser, page, loginAsUser, loginAsAdmin, createTestBook, createTestCollection }) => {
  const books = [await createTestBook(), await createTestBook()]
  const author = await loginAsUser()
  const collection = await createTestCollection({ authorUserId: author.userId, bookIds: books.map((book) => book.id) })

  await loginAsAdmin()
  await openModeration(page)
  await page.getByTestId('queue-published').getByText(collection.title).click()
  await page.getByRole('button', { name: 'Скрыть с причиной' }).click()
  await page.getByRole('dialog', { name: 'Почему скрываем' }).getByRole('textbox').fill('E2E: добавьте описание')
  await Promise.all([
    page.waitForResponse((response) => response.url().includes(`/api/admin/collections/${collection.id}/actions`), { timeout: 15_000 }),
    page.getByRole('button', { name: 'Отправить и скрыть' }).click(),
  ])

  await page.reload()
  await expect(page.getByTestId('queue-rejected-hidden')).toContainText(collection.title)

  const guest = await browser.newContext()
  const guestPage = await guest.newPage()
  expect((await guestPage.goto(collection.url))?.status()).toBe(404)
  await guest.close()
})

test('владелец удаляет опубликованную подборку', async ({ browser, page, loginAsUser, loginAsAdmin, createTestBook, createTestCollection }) => {
  const books = [await createTestBook(), await createTestBook()]
  const author = await loginAsUser()
  const collection = await createTestCollection({ authorUserId: author.userId, bookIds: books.map((book) => book.id) })

  await loginAsAdmin()
  await openModeration(page)
  await page.getByTestId('queue-published').getByText(collection.title).click()
  page.once('dialog', (dialog) => dialog.accept())
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith(`/api/admin/collections/${collection.id}`) && response.request().method() === 'DELETE', { timeout: 15_000 }),
    page.getByRole('button', { name: 'Удалить' }).click(),
  ])

  const guest = await browser.newContext()
  const guestPage = await guest.newPage()
  expect((await guestPage.goto(collection.url))?.status()).toBe(404)
  await guest.close()
})
