import { test, expect } from './fixtures'
import { epic, feature } from 'allure-js-commons'

test.describe('Саммари книг', () => {
  test.setTimeout(120_000)

  test.beforeEach(async () => {
    await epic('Каталог книг')
    await feature('Саммари участников')
  })

  test('участник отправляет саммари, админ публикует, публичная страница показывает текст', async ({ page, createTestBook, loginAsUser, loginAsAdmin }) => {
    const bookSlug = `e2e-summary-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
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
    await expect(page.getByText('ID саммари')).toBeVisible()
    await expect(page.getByText(draft.summary.id)).toBeVisible()
    await page.getByLabel('Красивый URL книги').fill(bookSlug)
    await page.getByLabel('Заголовок саммари в админке').fill('Почему институты решают')
    const publishResponse = page.waitForResponse(
      response => response.url().includes(`/api/admin/summaries/${draft.summary.id}/publish`) && response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Опубликовать' }).click()
    expect((await publishResponse).ok()).toBe(true)

    await page.goto(`/books/${encodeURIComponent(book.id)}/summaries`)
    await expect(page).toHaveURL(new RegExp(`/books/${bookSlug}/summaries$`))
    await expect(page.getByRole('heading', { name: book.title })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Почему институты решают' })).toBeVisible()
    await expect(page.getByText('Пока одно саммари этой книги.')).toBeVisible()
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
    await expect(page).toHaveURL(new RegExp(`/books/${bookSlug}/my-summary/edit$`))
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

    await page.goto(`/books/${bookSlug}/summaries`)
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
    await expect(page).toHaveURL(new RegExp(`/books/${bookSlug}/my-summary/edit$`))
    await expect(page.getByText('Правки отклонены')).toBeVisible()
    await expect(page.getByText('Нужно уточнить вывод')).toBeVisible()
    await page.getByLabel('Заголовок саммари').fill('Почему институты меняются со временем')
    await expect(page.getByRole('status')).toHaveText('Сохранено', { timeout: 10_000 })
    await page.getByRole('button', { name: 'Отправить на проверку' }).click()
    await expect(page).toHaveURL(/\/$/)

    await page.goto(`/books/${bookSlug}/summaries`)
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

    await page.goto(`/books/${bookSlug}/summaries`)
    await page.reload()
    await expect(page.getByRole('heading', { name: 'Почему институты меняются со временем' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Почему институты решают' })).toHaveCount(0)
  })

  test('Wikipedia-вставка: автор добавляет через тулбар, превью прелоадит, публичная страница показывает, при ошибке остаётся фолбэк', async ({ page, createTestBook, loginAsUser, loginAsAdmin }) => {
    const bookSlug = `e2e-wikipedia-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const wikipediaFixture = {
      language: 'ru',
      title: 'Социализм',
      articleUrl: 'https://ru.wikipedia.org/wiki/%D0%A1%D0%BE%D1%86%D0%B8%D0%B0%D0%BB%D0%B8%D0%B7%D0%BC',
      historyUrl: 'https://ru.wikipedia.org/wiki/%D0%A1%D0%BE%D1%86%D0%B8%D0%B0%D0%BB%D0%B8%D0%B7%D0%BC?action=history',
      revisionId: 1,
      revisionTimestamp: '2026-01-01T00:00:00Z',
      nodes: [{ type: 'paragraph', children: [{ type: 'text', value: 'Социализм — это общественный строй.' }] }],
    }

    let wikipediaRequests = 0
    let failNext = false
    await page.route('**/api/wikipedia/article?**', async route => {
      wikipediaRequests += 1
      if (failNext) {
        await route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'rate_limited' }) })
        return
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(wikipediaFixture) })
    })

    const book = await createTestBook({
      title: `E2E Wiki Book ${Date.now()}`,
      author: 'E2E Wiki Author',
      tags: ['институты'],
    })
    const user = await loginAsUser({ name: 'E2E Wiki Reader' })

    await page.request.post('/api/test/signup', {
      data: {
        userId: user.userId,
        name: user.name,
        email: user.email,
        contacts: '@e2e_wiki_reader',
        selectedBookIds: [book.id],
      },
    })
    await page.request.patch(`/api/signup-books/${encodeURIComponent(book.id)}/status`, { data: { status: 'read' } })

    const draftRes = await page.request.post(`/api/summaries/by-book/${encodeURIComponent(book.id)}`)
    expect(draftRes.ok()).toBe(true)
    const draft = (await draftRes.json()) as { summary: { id: string } }

    await page.goto(`/summaries/${draft.summary.id}/edit`)
    await page.waitForLoadState('networkidle')

    await page.getByLabel('Имя для публикации').fill('Wiki Reader')
    await page.getByLabel('Заголовок саммари').fill('Социализм и его истоки')
    await page.getByLabel('В двух словах').fill('Кратко об идее равенства.')

    await page.getByLabel('Текст саммари').fill('Социализм как способ разрешения противоречий.')
    await page.getByLabel('Текст саммари').evaluate((element: HTMLTextAreaElement) =>
      element.setSelectionRange(0, element.value.length),
    )
    await page.getByRole('button', { name: 'Вставка из Wikipedia' }).click()
    await page.getByLabel('Ссылка на статью Wikipedia').fill('https://ru.wikipedia.org/wiki/Социализм')
    await page.getByRole('button', { name: 'Вставить' }).click()

    await expect(page.getByRole('status')).toHaveText('Сохранено', { timeout: 10_000 })
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.getByLabel('Текст саммари')).toHaveValue(/Социализм как способ разрешения противоречий\./)
    await expect(page.getByLabel('Текст саммари')).toHaveValue(/"wikipedia"/)

    await page.getByRole('button', { name: 'Предпросмотр' }).click()
    await expect.poll(() => wikipediaRequests).toBeGreaterThan(0)
    // The article title shows in the collapsed card header once preloaded.
    await expect(page.locator('.nd-wikipedia-embed__title')).toHaveText('Социализм')
    await page.locator('.nd-wikipedia-embed').getByRole('button', { name: /wikipedia/i }).click()
    await expect(
      page.locator('.nd-wikipedia-embed__reader').getByRole('heading', { name: 'Социализм', exact: true }),
    ).toBeVisible()
    await expect(page.getByText('Социализм — это общественный строй.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Открыть оригинал' })).toBeVisible()
    await page.getByRole('button', { name: 'Предпросмотр' }).click()

    await page.getByRole('button', { name: 'Отправить на проверку' }).click()
    await expect(page).toHaveURL(/\/$/)

    await loginAsAdmin({ name: 'E2E Wiki Admin' })
    await page.goto('/admin?tab=summaries')
    await page.waitForLoadState('networkidle')
    await page.getByText('Социализм и его истоки').click()
    await page.getByLabel('Красивый URL книги').fill(bookSlug)
    const publishResponse = page.waitForResponse(
      response =>
        response.url().includes(`/api/admin/summaries/${draft.summary.id}/publish`) &&
        response.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Опубликовать' }).click()
    expect((await publishResponse).ok()).toBe(true)

    await page.goto(`/books/${bookSlug}/summaries`)
    await expect(page.locator('.nd-wikipedia-embed')).toBeVisible()
    await page.locator('.nd-wikipedia-embed').getByRole('button', { name: /wikipedia/i }).click()
    await expect(
      page.locator('.nd-wikipedia-embed__reader').getByRole('heading', { name: 'Социализм', exact: true }),
    ).toBeVisible()

    // Upstream failure must keep the author text and surface a safe fallback link.
    failNext = true
    await page.goto(`/books/${bookSlug}/summaries`)
    await expect(page.getByText('Социализм как способ разрешения противоречий.')).toBeVisible()
    await expect(
      page.locator('.nd-wikipedia-embed').getByRole('link', { name: /Открыть статью в Wikipedia/i }),
    ).toBeVisible()
  })

  async function publishSummary(
    page: import('@playwright/test').Page,
    opts: { bookId: string; bookSlug: string; userName: string; displayName: string; title: string; tldr: string; body: string },
    loginAsUser: (args: { name: string }) => Promise<{ userId: string; name: string; email: string }>,
    loginAsAdmin: (args: { name: string }) => Promise<unknown>,
  ) {
    const user = await loginAsUser({ name: opts.userName })
    await page.request.post('/api/test/signup', {
      data: { userId: user.userId, name: user.name, email: user.email, contacts: '@e2e', selectedBookIds: [opts.bookId] },
    })
    await page.request.patch(`/api/signup-books/${encodeURIComponent(opts.bookId)}/status`, { data: { status: 'read' } })
    const draftRes = await page.request.post(`/api/summaries/by-book/${encodeURIComponent(opts.bookId)}`)
    const draft = (await draftRes.json()) as { summary: { id: string } }

    await page.goto(`/summaries/${draft.summary.id}/edit`)
    await page.waitForLoadState('networkidle')
    await page.getByLabel('Имя для публикации').fill(opts.displayName)
    await page.getByLabel('Заголовок саммари').fill(opts.title)
    await page.getByLabel('В двух словах').fill(opts.tldr)
    await page.getByLabel('Текст саммари').fill(opts.body)
    await expect(page.getByRole('status')).toHaveText('Сохранено', { timeout: 10_000 })
    await page.getByRole('button', { name: 'Отправить на проверку' }).click()
    await expect(page).toHaveURL(/\/$/)

    await loginAsAdmin({ name: 'E2E Switcher Admin' })
    await page.goto('/admin?tab=summaries')
    await page.waitForLoadState('networkidle')
    await page.getByText(opts.title).first().click()
    await page.getByLabel('Красивый URL книги').fill(opts.bookSlug)
    const publishResponse = page.waitForResponse(
      r => r.url().includes(`/api/admin/summaries/${draft.summary.id}/publish`) && r.request().method() === 'POST',
    )
    await page.getByRole('button', { name: 'Опубликовать' }).click()
    expect((await publishResponse).ok()).toBe(true)
    return draft.summary.id
  }

  test('переключатель авторов показывает одно саммари за раз и хранит выбор в URL', async ({ page, createTestBook, loginAsUser, loginAsAdmin }) => {
    const bookSlug = `e2e-switch-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const book = await createTestBook({ title: 'E2E Switcher Book', author: 'E2E Author', tags: ['институты'] })

    await publishSummary(page, {
      bookId: book.id, bookSlug, userName: 'E2E Alpha', displayName: 'Автор Альфа',
      title: 'Саммари Альфы', tldr: 'Тезис Альфы.', body: '## Раздел Альфы\n\nТекст саммари Альфы.',
    }, loginAsUser, loginAsAdmin)

    await publishSummary(page, {
      bookId: book.id, bookSlug, userName: 'E2E Beta', displayName: 'Автор Бета',
      title: 'Саммари Беты', tldr: 'Тезис Беты.', body: '## Раздел Беты\n\nТекст саммари Беты.',
    }, loginAsUser, loginAsAdmin)

    await page.goto(`/books/${bookSlug}/summaries`)
    await page.waitForLoadState('networkidle')

    // Дефолт — самое свежее саммари (Бета опубликована последней).
    await expect(page.getByRole('heading', { name: 'Саммари Беты', level: 2 })).toBeVisible()
    await expect(page.getByText('Текст саммари Альфы.')).toHaveCount(0)

    // Переключаемся на Альфу.
    await page.getByRole('link', { name: /Автор Альфа/ }).click()
    await page.waitForLoadState('networkidle')
    await expect(page).toHaveURL(/\?author=/)
    await expect(page.getByRole('heading', { name: 'Саммари Альфы', level: 2 })).toBeVisible()
    await expect(page.getByText('Текст саммари Беты.')).toHaveCount(0)

    // Выбор хранится в URL — после перезагрузки остаётся Альфа.
    await page.reload()
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('heading', { name: 'Саммари Альфы', level: 2 })).toBeVisible()
  })
})
