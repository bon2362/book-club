import { test, expect } from './fixtures'
import { epic, feature } from 'allure-js-commons'

test.describe('Саммари книг', () => {
  test.setTimeout(120_000)

  test.beforeEach(async () => {
    await epic('Каталог книг')
    await feature('Саммари участников')
  })

  test('участник отправляет саммари, админ публикует, публичная страница показывает текст', async ({ page, createTestBook, loginAsUser, loginAsAdmin }) => {
    const book = await createTestBook({
      title: 'E2E Summary Book',
      author: 'E2E Summary Author',
      tags: ['институты'],
    })
    const user = await loginAsUser({ name: 'E2E Summary Reader' })

    await page.request.post('/api/test/signup', {
      data: {
        userId: user.userId,
        name: user.name,
        email: user.email,
        contacts: '@e2e_summary_reader',
        selectedBookIds: [book.id],
      },
    })

    const statusRes = await page.request.patch(`/api/signup-books/${encodeURIComponent(book.id)}/status`, {
      data: { status: 'read' },
    })
    expect(statusRes.ok()).toBe(true)

    const draftRes = await page.request.post(`/api/summaries/by-book/${encodeURIComponent(book.id)}`)
    expect(draftRes.ok()).toBe(true)
    const draft = (await draftRes.json()) as { summary: { id: string } }

    await page.goto(`/summaries/${draft.summary.id}/edit`)
    await page.waitForLoadState('networkidle')

    await page.getByLabel('Имя для публикации').fill('Reader One')
    await page.getByLabel('Заголовок саммари').fill('Почему институты важны')
    await page.getByLabel('В двух словах').fill('Экономика держится на правилах игры.')
    await page.getByLabel('Текст саммари').fill('## Главная мысль\n\n**Институты** задают стимулы и ограничения.')

    await expect(page.getByRole('status')).toHaveText('Сохранено', { timeout: 10_000 })
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.getByLabel('Заголовок саммари')).toHaveValue('Почему институты важны')
    await expect(page.getByLabel('Текст саммари')).toHaveValue(/Институты/)

    await page.getByRole('button', { name: 'Предпросмотр' }).click()
    await expect(page.getByRole('heading', { name: 'Почему институты важны' })).toBeVisible()
    await expect(page.getByText('Институты задают стимулы')).toBeVisible()
    await page.getByRole('button', { name: 'Предпросмотр' }).click()

    await page.getByRole('button', { name: 'Отправить на проверку' }).click()
    await expect(page).toHaveURL(/\/$/)

    await loginAsAdmin({ name: 'E2E Summary Admin' })
    await page.goto('/admin?tab=summaries')
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('Почему институты важны')).toBeVisible({ timeout: 10_000 })

    await page.getByText('Почему институты важны').click()
    await page.getByLabel('Заголовок саммари в админке').fill('Почему институты решают')
    const publishResponse = page.waitForResponse(
      response => response.url().includes(`/api/admin/summaries/${draft.summary.id}/publish`) && response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Опубликовать' }).click()
    expect((await publishResponse).ok()).toBe(true)

    await page.goto(`/books/${encodeURIComponent(book.id)}/summaries`)
    await expect(page.getByRole('heading', { name: book.title })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Почему институты решают' })).toBeVisible()
    await expect(page.getByText('Reader One')).toBeVisible()
    await expect(page.getByText('Институты задают стимулы')).toBeVisible()
  })
})
