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
    await page.getByLabel('Текст саммари').fill([
      '## Главная мысль',
      '',
      'Первый абзац раскрывает общий тезис.',
      '',
      'Второй абзац продолжает мысль с видимым отступом.',
      '',
      '### Разбор аргумента',
      '',
      '#### Внутренний тезис',
      '',
      '<details open>',
      '<summary>Длинный контекст</summary>',
      '',
      '**Институты** задают стимулы и ограничения.',
      '</details>',
      '',
      '- Противоречит ли социализм демократии?',
      '- Нужна ли диктатура как переходный этап?',
      '',
      '1. Сначала разобрать исторический контекст',
      '2. Затем сравнить политические выводы',
    ].join('\n'))

    await expect(page.getByRole('status')).toHaveText('Сохранено', { timeout: 10_000 })
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.getByLabel('Заголовок саммари')).toHaveValue('Почему институты важны')
    await expect(page.getByLabel('Текст саммари')).toHaveValue(/Институты/)

    await page.getByRole('button', { name: 'Предпросмотр' }).click()
    await expect(page.getByRole('heading', { name: 'Почему институты важны' })).toBeVisible()
    await expect(page.getByText('Первый абзац раскрывает общий тезис.')).toBeVisible()
    await expect(page.getByText('Второй абзац продолжает мысль с видимым отступом.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Разбор аргумента', level: 3 })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Внутренний тезис', level: 4 })).toBeVisible()
    await expect(page.getByText('Длинный контекст')).toBeVisible()
    await expect(page.getByText('Институты задают стимулы')).toBeVisible()
    await expect(page.getByRole('listitem').filter({ hasText: 'Противоречит ли социализм демократии?' })).toBeVisible()
    await expect(page.getByRole('listitem').filter({ hasText: 'Сначала разобрать исторический контекст' })).toBeVisible()
    const previewFirstParagraphBox = await page.getByText('Первый абзац раскрывает общий тезис.').boundingBox()
    const previewSecondParagraphBox = await page.getByText('Второй абзац продолжает мысль с видимым отступом.').boundingBox()
    expect(previewFirstParagraphBox).not.toBeNull()
    expect(previewSecondParagraphBox).not.toBeNull()
    expect(previewSecondParagraphBox!.y - (previewFirstParagraphBox!.y + previewFirstParagraphBox!.height)).toBeGreaterThan(8)
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
    await expect(page.getByText('Первый абзац раскрывает общий тезис.')).toBeVisible()
    await expect(page.getByText('Второй абзац продолжает мысль с видимым отступом.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Разбор аргумента', level: 3 })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Внутренний тезис', level: 4 })).toBeVisible()
    await expect(page.getByText('Длинный контекст')).toBeVisible()
    await expect(page.getByText('Институты задают стимулы')).toBeVisible()
    await expect(page.getByRole('listitem').filter({ hasText: 'Противоречит ли социализм демократии?' })).toBeVisible()
    await expect(page.getByRole('listitem').filter({ hasText: 'Сначала разобрать исторический контекст' })).toBeVisible()
    const publicFirstParagraphBox = await page.getByText('Первый абзац раскрывает общий тезис.').boundingBox()
    const publicSecondParagraphBox = await page.getByText('Второй абзац продолжает мысль с видимым отступом.').boundingBox()
    expect(publicFirstParagraphBox).not.toBeNull()
    expect(publicSecondParagraphBox).not.toBeNull()
    expect(publicSecondParagraphBox!.y - (publicFirstParagraphBox!.y + publicFirstParagraphBox!.height)).toBeGreaterThan(8)

    await loginAsUser({ email: user.email, name: user.name })
    await page.goto(`/summaries/${draft.summary.id}/edit`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('Опубликовано')).toBeVisible()

    const revisionResponse = page.waitForResponse(
      response => response.url().includes(`/api/summaries/${draft.summary.id}/revision`) && response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Редактировать' }).click()
    expect((await revisionResponse).ok()).toBe(true)
    await expect(page.getByText('Правки: черновик')).toBeVisible()

    await page.getByLabel('Заголовок саммари').fill('Почему институты меняются')
    await page.getByLabel('В двух словах').fill('Обновлённый вывод о правилах игры.')
    await expect(page.getByRole('status')).toHaveText('Сохранено', { timeout: 10_000 })
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.getByLabel('Заголовок саммари')).toHaveValue('Почему институты меняются')

    await page.getByRole('button', { name: 'Отправить на проверку' }).click()
    await expect(page).toHaveURL(/\/$/)

    await page.goto(`/books/${encodeURIComponent(book.id)}/summaries`)
    await expect(page.getByRole('heading', { name: 'Почему институты решают' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Почему институты меняются' })).toHaveCount(0)

    await loginAsAdmin({ name: 'E2E Summary Admin' })
    await page.goto('/admin?tab=summaries')
    await page.waitForLoadState('networkidle')
    await page.getByText('Почему институты меняются').click()
    await expect(page.getByText('Правки к опубликованному')).toBeVisible()
    await expect(page.getByText('Почему институты решают')).toBeVisible()
    await page.getByLabel('Причина отказа саммари').fill('Нужно уточнить вывод')
    const rejectResponse = page.waitForResponse(
      response => response.url().includes('/api/admin/summary-revisions/') && response.url().endsWith('/reject') && response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Отклонить правки' }).click()
    expect((await rejectResponse).ok()).toBe(true)

    await loginAsUser({ email: user.email, name: user.name })
    await page.goto(`/summaries/${draft.summary.id}/edit`)
    await page.waitForLoadState('networkidle')
    await expect(page.getByText('Правки отклонены')).toBeVisible()
    await expect(page.getByText('Нужно уточнить вывод')).toBeVisible()
    await page.getByLabel('Заголовок саммари').fill('Почему институты меняются со временем')
    await expect(page.getByRole('status')).toHaveText('Сохранено', { timeout: 10_000 })
    await page.getByRole('button', { name: 'Отправить на проверку' }).click()
    await expect(page).toHaveURL(/\/$/)

    await page.goto(`/books/${encodeURIComponent(book.id)}/summaries`)
    await expect(page.getByRole('heading', { name: 'Почему институты решают' })).toBeVisible()

    await loginAsAdmin({ name: 'E2E Summary Admin' })
    await page.goto('/admin?tab=summaries')
    await page.waitForLoadState('networkidle')
    await page.getByText('Почему институты меняются со временем').click()
    const revisionPublishResponse = page.waitForResponse(
      response => response.url().includes('/api/admin/summary-revisions/') && response.url().endsWith('/publish') && response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Опубликовать правки' }).click()
    expect((await revisionPublishResponse).ok()).toBe(true)

    await page.goto(`/books/${encodeURIComponent(book.id)}/summaries`)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Почему институты меняются со временем' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Почему институты решают' })).toHaveCount(0)
  })
})
