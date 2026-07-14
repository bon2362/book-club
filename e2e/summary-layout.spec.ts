import { test, expect } from './fixtures'
import { epic, feature } from 'allure-js-commons'

test.beforeEach(async () => {
  await epic('UI')
  await feature('Состояния интерфейса')
})

test.describe('Summary editor layout', () => {
  test('helpful footer stays below the summary body without hydration shift', async ({
    page,
    createPublishedSummary,
  }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    const summary = await createPublishedSummary({
      bodyMarkdown: 'Первый абзац саммари.\n\nВторой абзац делает тело достаточно заметным.',
    })

    await page.goto(summary.url, { waitUntil: 'domcontentloaded' })
    const article = page.getByTestId('summary-article')
    const body = page.getByTestId('summary-article-body')
    const footer = page.getByTestId('summary-helpful-footer')
    const beforeHydration = await footer.boundingBox()
    await page.waitForLoadState('networkidle')
    const articleBox = await article.boundingBox()
    const bodyBox = await body.boundingBox()
    const footerBox = await footer.boundingBox()

    expect(beforeHydration).not.toBeNull()
    expect(articleBox).not.toBeNull()
    expect(bodyBox).not.toBeNull()
    expect(footerBox).not.toBeNull()
    expect(footerBox!.y).toBeGreaterThanOrEqual(bodyBox!.y + bodyBox!.height)
    expect(footerBox!.x).toBeGreaterThanOrEqual(articleBox!.x)
    expect(footerBox!.x + footerBox!.width).toBeLessThanOrEqual(articleBox!.x + articleBox!.width)
    expect(Math.abs(footerBox!.y - beforeHydration!.y)).toBeLessThanOrEqual(1)
  })

  test('admin moderation keeps the slug field and summary ID visible', async ({
    page,
    createTestBook,
    loginAsUser,
    loginAsAdmin,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const book = await createTestBook({
      title: `UI Summary Moderation ${Date.now()}`,
      author: 'Layout Author',
    })
    const user = await loginAsUser({ name: 'UI Summary Reviewer' })
    await page.request.post('/api/test/signup', {
      data: {
        userId: user.userId,
        name: user.name,
        email: user.email,
        contacts: '@ui_summary_reviewer',
        selectedBookIds: [book.id],
      },
    })
    await page.request.patch(`/api/signup-books/${encodeURIComponent(book.id)}/status`, {
      data: { status: 'read' },
    })
    const draftRes = await page.request.post(`/api/summaries/by-book/${encodeURIComponent(book.id)}`)
    expect(draftRes.ok()).toBe(true)
    const draft = (await draftRes.json()) as { summary: { id: string } }
    const saveRes = await page.request.patch(`/api/summaries/${draft.summary.id}`, {
      data: {
        displayName: 'UI Reviewer',
        title: 'UI Moderation Summary',
        tldr: 'Короткий вывод для layout-проверки.',
        bodyMarkdown: 'Полный текст для layout-проверки.',
      },
    })
    expect(saveRes.ok()).toBe(true)
    const submitRes = await page.request.post(`/api/summaries/${draft.summary.id}/submit`)
    expect(submitRes.ok()).toBe(true)

    await loginAsAdmin({ name: 'UI Summary Admin' })
    await page.goto('/admin?tab=summaries')
    await page.waitForLoadState('networkidle')
    await page.getByText('UI Moderation Summary').click()

    const slugBox = await page.getByLabel('Красивый URL книги').boundingBox()
    const idsBox = await page.getByTestId('summary-moderation-ids').boundingBox()
    const viewport = page.viewportSize()!
    expect(slugBox).not.toBeNull()
    expect(idsBox).not.toBeNull()
    expect(slugBox!.x).toBeGreaterThanOrEqual(0)
    expect(slugBox!.x + slugBox!.width).toBeLessThanOrEqual(viewport.width)
    expect(idsBox!.x).toBeGreaterThanOrEqual(0)
    expect(idsBox!.x + idsBox!.width).toBeLessThanOrEqual(viewport.width)
    await expect(page.getByTestId('summary-moderation-ids')).toContainText(draft.summary.id)
  })

  test('main markdown field reads as a large writing page', async ({ page, createTestBook, loginAsUser }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const book = await createTestBook({
      title: `UI Summary Page ${Date.now()}`,
      author: 'Layout Author',
    })
    const user = await loginAsUser({ name: 'UI Summary Writer' })

    const signupRes = await page.request.post('/api/test/signup', {
      data: {
        userId: user.userId,
        name: user.name,
        email: user.email,
        contacts: '@ui_summary_writer',
        selectedBookIds: [book.id],
      },
    })
    expect(signupRes.ok()).toBe(true)

    const statusRes = await page.request.patch(`/api/signup-books/${encodeURIComponent(book.id)}/status`, {
      data: { status: 'read' },
    })
    expect(statusRes.ok()).toBe(true)

    const draftRes = await page.request.post(`/api/summaries/by-book/${encodeURIComponent(book.id)}`)
    expect(draftRes.ok()).toBe(true)
    const draft = (await draftRes.json()) as { summary: { id: string } }

    await page.goto(`/summaries/${draft.summary.id}/edit`)
    await page.waitForLoadState('networkidle')

    const viewport = page.viewportSize()!
    const workspaceBox = await page.getByTestId('summary-editor-workspace').boundingBox()
    const bodyBox = await page.getByLabel('Текст саммари').boundingBox()
    const toolbarBox = await page.getByTestId('summary-editor-toolbar').boundingBox()

    expect(workspaceBox).not.toBeNull()
    expect(bodyBox).not.toBeNull()
    expect(toolbarBox).not.toBeNull()
    expect(workspaceBox!.width).toBeGreaterThan(860)
    expect(workspaceBox!.width).toBeLessThanOrEqual(984)
    expect(bodyBox!.height).toBeGreaterThanOrEqual(viewport.height * 0.64)
    expect(bodyBox!.width).toBeGreaterThanOrEqual(workspaceBox!.width - 64)
    expect(toolbarBox!.width).toBeGreaterThanOrEqual(workspaceBox!.width - 64)
  })

  test('форматирование не меняет прокрутку и сохраняет выделенный текст', async ({
    page,
    createTestBook,
    loginAsUser,
  }) => {
    await page.setViewportSize({ width: 1280, height: 720 })
    const book = await createTestBook({
      title: `UI Summary Formatting ${Date.now()}`,
      author: 'Layout Author',
    })
    const user = await loginAsUser({ name: 'UI Formatting Writer' })
    const signupRes = await page.request.post('/api/test/signup', {
      data: {
        userId: user.userId,
        name: user.name,
        email: user.email,
        contacts: '@ui_formatting_writer',
        selectedBookIds: [book.id],
      },
    })
    expect(signupRes.ok()).toBe(true)
    const statusRes = await page.request.patch(`/api/signup-books/${encodeURIComponent(book.id)}/status`, {
      data: { status: 'read' },
    })
    expect(statusRes.ok()).toBe(true)
    const draftRes = await page.request.post(`/api/summaries/by-book/${encodeURIComponent(book.id)}`)
    expect(draftRes.ok()).toBe(true)
    const draft = (await draftRes.json()) as { summary: { id: string } }
    const marker = 'выделенный фрагмент'
    const longBody = [
      ...Array.from({ length: 70 }, (_, index) => `Вводная строка ${index}`),
      marker,
      ...Array.from({ length: 70 }, (_, index) => `Заключительная строка ${index}`),
    ].join('\n')
    const saveRes = await page.request.patch(`/api/summaries/${draft.summary.id}`, {
      data: { bodyMarkdown: longBody },
    })
    expect(saveRes.ok()).toBe(true)

    await page.goto(`/summaries/${draft.summary.id}/edit`)
    await page.waitForLoadState('networkidle')
    const textarea = page.getByLabel('Текст саммари')
    const boldButton = page.getByRole('button', { name: 'Жирный' })
    await expect(textarea).toBeVisible()
    await expect(boldButton).toBeVisible()

    await textarea.evaluate((element, selectedText) => {
      const input = element as HTMLTextAreaElement
      const start = input.value.indexOf(selectedText)
      input.focus()
      input.setSelectionRange(start, start + selectedText.length)
      input.scrollTop = Math.min(900, input.scrollHeight - input.clientHeight)
    }, marker)
    await page.evaluate(() => window.scrollTo({ top: 640, behavior: 'instant' }))

    const before = await textarea.evaluate(element => {
      const input = element as HTMLTextAreaElement
      return { pageY: window.scrollY, scrollTop: input.scrollTop }
    })

    await boldButton.click()
    await expect.poll(() => textarea.evaluate(element => {
      const input = element as HTMLTextAreaElement
      return input.value.slice(input.selectionStart, input.selectionEnd)
    })).toBe(marker)

    const after = await textarea.evaluate(element => {
      const input = element as HTMLTextAreaElement
      return {
        pageY: window.scrollY,
        scrollTop: input.scrollTop,
        focused: document.activeElement === input,
        formatted: input.value.includes('**выделенный фрагмент**'),
      }
    })
    expect(after.focused).toBe(true)
    expect(after.formatted).toBe(true)
    expect(Math.abs(after.pageY - before.pageY)).toBeLessThanOrEqual(1)
    expect(Math.abs(after.scrollTop - before.scrollTop)).toBeLessThanOrEqual(1)
  })

  test('details rail spans the open block and only the rail collapses body text', async ({ page, createTestBook, loginAsUser }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    const book = await createTestBook({
      title: `UI Summary Details ${Date.now()}`,
      author: 'Layout Author',
    })
    const user = await loginAsUser({ name: 'UI Details Writer' })

    const signupRes = await page.request.post('/api/test/signup', {
      data: {
        userId: user.userId,
        name: user.name,
        email: user.email,
        contacts: '@ui_details_writer',
        selectedBookIds: [book.id],
      },
    })
    expect(signupRes.ok()).toBe(true)

    const statusRes = await page.request.patch(`/api/signup-books/${encodeURIComponent(book.id)}/status`, {
      data: { status: 'read' },
    })
    expect(statusRes.ok()).toBe(true)

    const draftRes = await page.request.post(`/api/summaries/by-book/${encodeURIComponent(book.id)}`)
    expect(draftRes.ok()).toBe(true)
    const draft = (await draftRes.json()) as { summary: { id: string } }

    await page.goto(`/summaries/${draft.summary.id}/edit`)
    await page.waitForLoadState('networkidle')
    await page.getByLabel('Текст саммари').fill([
      'Короткая выжимка остается видимой.',
      '',
      '<details open>',
      '<summary>Революция и демократия</summary>',
      '',
      'Текст подробного слоя можно спокойно выделять.',
      '',
      '> Политика начинается там, где заканчивается утопия.',
      '</details>',
    ].join('\n'))
    await page.getByRole('button', { name: 'Предпросмотр' }).click()

    const details = page.locator('.nd-summary-details')
    const summary = details.locator('.nd-summary-details__summary')
    const rail = details.locator('.nd-summary-details__rail')
    const bodyText = page.getByText('Текст подробного слоя можно спокойно выделять.')
    const quote = page.locator('.nd-summary-blockquote')
    const quoteMark = quote.locator('.nd-summary-blockquote__mark')

    await expect(details).toHaveAttribute('open', '')
    await expect(bodyText).toBeVisible()
    await expect(quoteMark).toHaveText('“')

    const detailsBox = await details.boundingBox()
    const railBox = await rail.boundingBox()
    const bodyBox = await bodyText.boundingBox()
    const quoteBox = await quote.boundingBox()
    const quoteMarkBox = await quoteMark.boundingBox()

    expect(detailsBox).not.toBeNull()
    expect(railBox).not.toBeNull()
    expect(bodyBox).not.toBeNull()
    expect(quoteBox).not.toBeNull()
    expect(quoteMarkBox).not.toBeNull()
    expect(railBox!.height).toBeGreaterThanOrEqual(detailsBox!.height - 1)
    expect(railBox!.width).toBeGreaterThanOrEqual(20)
    expect(bodyBox!.x).toBeGreaterThan(railBox!.x + railBox!.width)
    expect(quoteMarkBox!.x).toBeLessThan(quoteBox!.x + 38)

    await bodyText.hover()
    const restingWidth = await rail.evaluate(element => Number.parseFloat(getComputedStyle(element, '::before').width))
    expect(restingWidth).toBe(2)
    await rail.hover()
    await expect.poll(
      () => rail.evaluate(element => Number.parseFloat(getComputedStyle(element, '::before').width)),
    ).toBe(5)

    await bodyText.click()
    await expect(details).toHaveAttribute('open', '')
    await rail.click({ position: { x: railBox!.width / 2, y: railBox!.height - 8 } })
    await expect(details).not.toHaveAttribute('open')
    await expect(bodyText).not.toBeVisible()

    const accentSoft = await page.evaluate(() => {
      const probe = document.createElement('div')
      probe.style.background = 'var(--accent-soft)'
      document.body.appendChild(probe)
      const color = getComputedStyle(probe).backgroundColor
      probe.remove()
      return color
    })
    await expect(summary).not.toHaveCSS('background-color', accentSoft)
    await summary.hover()
    await expect(summary).toHaveCSS('background-color', accentSoft)
  })
})

test.describe('Wikipedia summary widget layout', () => {
  test('раскрывается во внутренний скролл и сдвигает следующий абзац', async ({ page, createTestBook, loginAsUser }) => {
    await page.setViewportSize({ width: 1280, height: 900 })

    const tallArticle = {
      language: 'ru',
      title: 'Социализм',
      articleUrl: 'https://ru.wikipedia.org/wiki/X',
      historyUrl: 'https://ru.wikipedia.org/wiki/X?action=history',
      revisionId: 1,
      revisionTimestamp: '2026-01-01T00:00:00Z',
      nodes: Array.from({ length: 60 }, (_, index) => ({
        type: 'paragraph',
        children: [{ type: 'text', value: `Параграф номер ${index} с достаточным текстом, чтобы reader пришлось прокручивать.` }],
      })),
    }
    await page.route('**/api/wikipedia/article?**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(tallArticle) })
    })

    const book = await createTestBook({ title: `UI Wiki ${Date.now()}`, author: 'Layout Author' })
    const user = await loginAsUser({ name: 'UI Wiki Writer' })

    const signupRes = await page.request.post('/api/test/signup', {
      data: {
        userId: user.userId,
        name: user.name,
        email: user.email,
        contacts: '@ui_wiki_writer',
        selectedBookIds: [book.id],
      },
    })
    expect(signupRes.ok()).toBe(true)
    await page.request.patch(`/api/signup-books/${encodeURIComponent(book.id)}/status`, { data: { status: 'read' } })

    const draftRes = await page.request.post(`/api/summaries/by-book/${encodeURIComponent(book.id)}`)
    expect(draftRes.ok()).toBe(true)
    const draft = (await draftRes.json()) as { summary: { id: string } }

    await page.goto(`/summaries/${draft.summary.id}/edit`)
    await page.waitForLoadState('networkidle')
    await page.getByLabel('Текст саммари').fill([
      '> Авторская подводка к статье.',
      '>',
      '> [Wikipedia: Социализм](https://ru.wikipedia.org/wiki/Социализм "wikipedia")',
      '',
      'Абзац после Wikipedia-вставки.',
    ].join('\n'))

    await page.getByRole('button', { name: 'Предпросмотр' }).click()

    const widget = page.locator('.nd-wikipedia-embed')
    await expect(widget).toBeVisible()

    // The article title is pinned to the top-right of the collapsed card.
    const title = widget.locator('.nd-wikipedia-embed__title')
    await expect(title).toHaveText('Социализм')
    const widgetBox = await widget.boundingBox()
    const titleBox = await title.boundingBox()
    const labelBox = await widget.locator('.nd-wikipedia-embed__label').boundingBox()
    expect(widgetBox).not.toBeNull()
    expect(titleBox).not.toBeNull()
    expect(labelBox).not.toBeNull()
    expect(widgetBox!.x + widgetBox!.width - (titleBox!.x + titleBox!.width)).toBeLessThan(40)
    expect(titleBox!.x).toBeGreaterThan(labelBox!.x + labelBox!.width)
    expect(titleBox!.y).toBeLessThan(labelBox!.y + labelBox!.height + 8)

    const followingParagraph = page.getByText('Абзац после Wikipedia-вставки.')
    const before = await followingParagraph.boundingBox()

    await widget.getByRole('button', { name: /wikipedia/i }).click()
    await expect(
      widget.locator('.nd-wikipedia-embed__reader').getByRole('heading', { name: 'Социализм', exact: true }),
    ).toBeVisible()

    const after = await followingParagraph.boundingBox()
    const reader = widget.locator('.nd-wikipedia-embed__reader')
    const readerBox = await reader.boundingBox()

    expect(before).not.toBeNull()
    expect(after).not.toBeNull()
    expect(readerBox).not.toBeNull()
    // Opening the reader pushes the next paragraph well down the page…
    expect(after!.y).toBeGreaterThan(before!.y + 200)
    // …while the reader itself stays bounded by 64vh and scrolls internally.
    expect(readerBox!.height).toBeLessThanOrEqual(900 * 0.64 + 2)
    expect(await reader.evaluate(element => element.scrollHeight)).toBeGreaterThan(readerBox!.height)

    // Clicking inside the reader must not collapse the widget.
    await reader.getByText('Параграф номер 0', { exact: false }).click()
    await expect(reader).toBeVisible()
  })
})

test.describe('Оглавление саммари (TOC)', () => {
  // ≥2 заголовков ## нужно, т.к. страница саммари рендерит <SummaryToc>
  // только при toc.length >= 2 (app/books/[bookSlug]/summaries/page.tsx).
  // Слуги проверены напрямую через lib/summary-toc.ts slugify(): кириллица
  // лишь лоуеркейзится, а всё вне [a-zа-яё0-9] схлопывается в дефис —
  // «Ключевые идеи» → «ключевые-идеи», «Выводы» → «выводы» (проверено node -e).
  const body = [
    '## Контекст', ...Array(20).fill('Текст раздела контекста.'),
    '## Ключевые идеи', ...Array(20).fill('Текст раздела идей.'),
    '## Выводы', ...Array(20).fill('Текст раздела выводов.'),
  ].join('\n\n')

  test('десктоп: sticky-рукав держится во вьюпорте и подсвечивает секцию', async ({ page, createPublishedSummary }) => {
    const summary = await createPublishedSummary({ bodyMarkdown: body })
    // .summary-toc__rail переключается чистым CSS media query
    // (min-width: 1100px, app/globals.css) — не JS-брейкпоинтом, поэтому
    // порядок setViewportSize относительно goto не влияет на рендер рукава.
    await page.setViewportSize({ width: 1280, height: 800 })
    await page.goto(summary.url)
    await page.waitForLoadState('networkidle')

    const rail = page.locator('.summary-toc__rail')
    await expect(rail).toBeVisible()

    // Доступное имя ссылки — это h.text напрямую: SummaryToc.tsx рендерит
    // {h.text} без обёртки/иконок внутри <a>, поэтому точное имя совпадает
    // с текстом заголовка markdown.
    await rail.getByRole('link', { name: 'Выводы' }).click()
    const heading = page.locator('h2#выводы')
    await expect.poll(async () => {
      const box = await heading.boundingBox()
      return box ? box.y : 9999
    }, { timeout: 2000 }).toBeLessThan(400)

    // Рукав остаётся во вьюпорте и НЕ уезжает вместе со страницей (sticky):
    // фиксируем его y после первого скролла, скроллим ещё дальше и проверяем,
    // что y практически не изменился — иначе это не sticky, а обычный поток
    // (регрессия, которую ловит FIX 2: align-items: start схлопывал containing block).
    const boxAfterFirstScroll = await rail.boundingBox()
    expect(boxAfterFirstScroll!.y).toBeGreaterThanOrEqual(0)
    expect(boxAfterFirstScroll!.y).toBeLessThan(page.viewportSize()!.height)

    await page.mouse.wheel(0, 600)
    await expect.poll(async () => {
      const box = await rail.boundingBox()
      return box ? Math.abs(box.y - boxAfterFirstScroll!.y) : 9999
    }, { timeout: 2000 }).toBeLessThanOrEqual(3)

    const boxAfterSecondScroll = await rail.boundingBox()
    expect(boxAfterSecondScroll!.y).toBeGreaterThanOrEqual(0)
    expect(boxAfterSecondScroll!.y).toBeLessThan(page.viewportSize()!.height)

    // aria-current="true" проставляется через IntersectionObserver
    // (rootMargin: '-15% 0px -70% 0px' в SummaryToc.tsx) — после scrollIntoView
    // секция «Выводы» попадает в видимую полосу и становится activeId.
    await expect.poll(
      () => rail.getByRole('link', { name: 'Выводы' }).getAttribute('aria-current'),
      { timeout: 2000 },
    ).toBe('true')
  })

  test('мобилка: sticky-бар открывает лист и скроллит', async ({ page, createPublishedSummary }) => {
    const summary = await createPublishedSummary({ bodyMarkdown: body })
    await page.setViewportSize({ width: 375, height: 812 })
    await page.goto(summary.url)
    await page.waitForLoadState('networkidle')

    // Рукав скрыт, бар виден
    await expect(page.locator('.summary-toc__rail')).toBeHidden()
    const bar = page.locator('.summary-toc__bar-button')
    await expect(bar).toBeVisible()

    // Тап открывает нижний лист. role="dialog" + aria-label="Разделы статьи" —
    // прямо из SummaryToc.tsx (.summary-toc__sheet); правило testing.md требует
    // role="dialog" на модалках, иначе getByRole не найдёт элемент.
    await bar.click()
    const sheet = page.getByRole('dialog', { name: 'Разделы статьи' })
    await expect(sheet).toBeVisible()

    // Тап по пункту скроллит и закрывает лист — go(id) в SummaryToc.tsx
    // синхронно вызывает setOpen(false) в том же обработчике клика.
    await sheet.getByRole('link', { name: 'Ключевые идеи' }).click()
    await expect(sheet).toBeHidden()
    await expect.poll(async () => {
      const box = await page.locator('h2#ключевые-идеи').boundingBox()
      return box ? box.y : 9999
    }, { timeout: 2000 }).toBeLessThan(400)
  })
})
