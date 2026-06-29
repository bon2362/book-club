import { test, expect, type Page } from './fixtures'
import { epic, feature } from 'allure-js-commons'

async function isFullyAboveViewport(page: import('@playwright/test').Page, selector: string) {
  const box = await page.locator(selector).boundingBox()
  if (!box) return true
  return box.y + box.height <= 0
}

async function isFullyVisible(page: import('@playwright/test').Page, selector: string) {
  const box = await page.locator(selector).boundingBox()
  if (!box) return false
  return box.y >= 0 && box.y < page.viewportSize()!.height
}

async function isFullyAboveViewportByLocator(locator: import('@playwright/test').Locator) {
  const box = await locator.boundingBox()
  if (!box) return true
  return box.y + box.height <= 0
}

test.beforeEach(async () => {
  await epic('UI')
  await feature('Состояния интерфейса')
})

test.describe('Header: hide on scroll', () => {
  // Объединяет прежние 4 теста (виден вверху, прячется при скролле вниз,
  // фильтр-бар прячется вместе с хедером) в один сценарий «вниз».
  test('header и filter bar видны вверху и прячутся при скролле вниз', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // Вверху страницы хедер полностью виден
    expect(await isFullyVisible(page, 'header')).toBe(true)

    // Скролл вниз — хедер и фильтр-бар уходят за верхнюю границу вместе
    await page.evaluate(() => window.scrollTo({ top: 300, behavior: 'instant' }))
    await expect.poll(() => isFullyAboveViewport(page, 'header'), { timeout: 1500 }).toBe(true)
    await expect.poll(() => isFullyAboveViewportByLocator(page.locator('.filters-bar')), { timeout: 1500 }).toBe(true)
  })

  test('header и filter bar появляются при скролле вверх', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => window.scrollTo({ top: 300, behavior: 'instant' }))
    await page.waitForTimeout(350)
    await page.evaluate(() => window.scrollTo({ top: 100, behavior: 'instant' }))
    await expect.poll(() => isFullyVisible(page, 'header'), { timeout: 1500 }).toBe(true)
  })
})

test.describe('Auth modal remembered provider hint', () => {
  test('google provider badge stays anchored to the button and opens secondary methods automatically', async ({ page }) => {
    await page.addInitScript(() => {
      localStorage.setItem('slowreading.lastAuthProvider', 'google')
    })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: /^войти$/i }).click()

    const dialog = page.getByRole('dialog', { name: /войти в круг/i })
    await expect(dialog).toBeVisible()
    const googleButton = dialog.getByRole('button', { name: /войти через google/i })
    const emailInput = dialog.getByPlaceholder(/ваш@email.com/i)
    const rememberedBadge = dialog.getByText('Последний вход', { exact: true })

    await expect(googleButton).toBeVisible()
    await expect(emailInput).toBeVisible()
    await expect(dialog.getByText(/В прошлый раз вы входили через Google/)).toBeVisible()
    await expect(rememberedBadge).toBeVisible()

    const dialogBox = await dialog.boundingBox()
    const buttonBox = await googleButton.boundingBox()
    const badgeBox = await rememberedBadge.boundingBox()

    expect(dialogBox).not.toBeNull()
    expect(buttonBox).not.toBeNull()
    expect(badgeBox).not.toBeNull()
    expect(badgeBox!.x).toBeGreaterThanOrEqual(dialogBox!.x - 1)
    expect(badgeBox!.x + badgeBox!.width).toBeLessThanOrEqual(dialogBox!.x + dialogBox!.width + 1)
    expect(badgeBox!.y).toBeLessThan(buttonBox!.y + 2)
    expect(badgeBox!.y + badgeBox!.height).toBeGreaterThan(buttonBox!.y - 16)
    expect(badgeBox!.x + badgeBox!.width).toBeGreaterThan(buttonBox!.x + buttonBox!.width / 2)
  })
})

test.describe('Home submit book CTA layout', () => {
  test('submit book button is compact on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // На мобильном видим именно мобильный каталог (десктоп-дерево скрыто
    // media-query, но присутствует в DOM) — скоупим на видимый контейнер.
    const box = await page.getByTestId('catalog-mobile').getByTestId('submit-book-card').boundingBox()
    expect(box).not.toBeNull()
    expect(box!.height).toBeLessThanOrEqual(96)
  })

  test('book search input uses iOS-safe font size on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const fontSize = await page.getByPlaceholder('Поиск по названию или автору…').evaluate((element) => (
      Number.parseFloat(window.getComputedStyle(element).fontSize)
    ))

    // iOS Safari auto-zooms focused form controls below 16px.
    expect(fontSize).toBeGreaterThanOrEqual(16)
  })

  test('submitted-by-member badge does not create horizontal overflow on mobile tap', async ({
    page,
    createTestBook,
    dbExec,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    const book = await createTestBook({
      title: `UI Submitted ${Date.now()}`,
      author: 'Layout Author',
      description: 'A submitted book used to prove the source badge stays inside the mobile viewport.',
    })
    await dbExec('update books set source = $1 where id = $2', ['submission', book.id])

    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.getByPlaceholder('Поиск по названию или автору…').fill(book.title)
    await expect(page.getByRole('heading', { name: book.title })).toBeVisible()

    const submittedBadge = page.getByTestId('catalog-mobile').locator('[aria-label="Эта книга предложена участни:цей клуба"]')
    await submittedBadge.click()

    const tooltip = page.getByTestId('catalog-mobile').getByTestId('submitted-book-tooltip')
    await expect(tooltip).toBeVisible()
    await submittedBadge.click()
    await expect(tooltip).toBeVisible()

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow).toBeLessThanOrEqual(1)

    const tooltipBox = await tooltip.boundingBox()
    const viewport = page.viewportSize()!
    expect(tooltipBox).not.toBeNull()
    expect(tooltipBox!.x).toBeGreaterThanOrEqual(0)
    expect(tooltipBox!.x + tooltipBox!.width).toBeLessThanOrEqual(viewport.width)
  })
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

async function joinMatchingSessionAndAddBooks(page: Page, sessionId: string, bookIds: string[]) {
  const joinRes = await page.request.post(`/api/matching/sessions/${sessionId}/join`, {
    data: { name: 'E2E Matching Reader' },
  })
  expect(joinRes.ok()).toBe(true)
  for (const bookId of bookIds) {
    const addRes = await page.request.post('/api/matching/books', { data: { bookId } })
    expect(addRes.ok()).toBe(true)
  }
  if (bookIds.length > 0) {
    const rankRes = await page.request.patch('/api/matching/priorities', { data: { bookIds } })
    expect(rankRes.ok()).toBe(true)
  }
}

test.describe('Matching layout', () => {
  test('scenarios use the released full width and legacy panels occupy no layout', async ({
    page,
    createMatchingSession,
    createTestBook,
    loginAsUser,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const session = await createMatchingSession({ minGroupSize: 2, maxGroupSize: 2 })
    const circleBook = await createTestBook({ title: `UI Circle ${Date.now()}`, author: 'Layout Author' })

    await loginAsUser({ name: 'UI Matching One' })
    await joinMatchingSessionAndAddBooks(page, session.id, [circleBook.id])
    await loginAsUser({ name: 'UI Matching Two' })
    await joinMatchingSessionAndAddBooks(page, session.id, [circleBook.id])

    await page.goto('/matching')
    const board = page.getByTestId('matching-realtime-client')
    const card = page.getByTestId('matching-scenario-card').first()
    await expect(card).toBeVisible()
    const boardBox = await board.boundingBox()
    const cardBox = await card.boundingBox()
    expect(boardBox).not.toBeNull()
    expect(cardBox).not.toBeNull()
    expect(cardBox!.width).toBeGreaterThanOrEqual(boardBox!.width * 0.95)
    await expect(page.getByText('Мои ходы', { exact: true })).toHaveCount(0)
    await expect(page.getByText('Лента событий', { exact: true })).toHaveCount(0)
  })
})

test.describe('Admin user drawer layout', () => {
  const ADMIN_EMAIL = 'e2e-ui-admin@test.invalid'
  const USER_EMAIL = 'e2e-ui-drawer-user@test.invalid'
  const USER_ID = `test:${USER_EMAIL}`
  const USER_NAME = 'E2E UI Drawer User'

  test.afterEach(async ({ page }) => {
    await page.request.delete('/api/test/signup', { data: { userId: USER_ID } })
    await page.request.delete('/api/test/session', { data: { email: ADMIN_EMAIL } })
    await page.request.delete('/api/test/session', { data: { email: USER_EMAIL } })
  })

  test('drawer slides in from the right within viewport bounds', async ({ page }) => {
    await page.request.post('/api/test/session', { data: { email: USER_EMAIL, name: USER_NAME } })
    await page.request.post('/api/test/signup', {
      data: { userId: USER_ID, name: USER_NAME, email: USER_EMAIL, contacts: '@ui_drawer', selectedBooks: ['Тестовая книга 1'] },
    })
    await page.request.post('/api/test/session', { data: { email: ADMIN_EMAIL, name: 'E2E UI Admin', isAdmin: true } })

    await page.goto('/admin')
    await page.waitForLoadState('networkidle')
    await page.getByLabel('Поиск пользователей').fill(USER_NAME)
    await page.locator('tr').filter({ hasText: USER_NAME }).click()
    const viewport = page.viewportSize()!
    await expect.poll(async () => {
      const box = await page.getByRole('dialog').boundingBox()
      if (!box) return false
      return box.width <= 640
        && box.x + box.width <= viewport.width + 1
        && box.x >= Math.max(0, viewport.width - 641)
    }, { timeout: 1500 }).toBe(true)
  })
})

test.describe('Admin tab layout states', () => {
  const ADMIN_EMAIL = 'e2e-ui-admin-tabs@test.invalid'

  test.beforeEach(async ({ page }) => {
    await page.request.post('/api/test/session', { data: { email: ADMIN_EMAIL, name: 'E2E UI Admin Tabs', isAdmin: true } })
  })

  test.afterEach(async ({ page }) => {
    await page.request.delete('/api/test/session', { data: { email: ADMIN_EMAIL } })
  })

  test('book sort arrow stays on the same line as header text', async ({ page }) => {
    await page.goto('/admin')
    await page.waitForLoadState('networkidle')
    await page.getByTestId('admin-tab-catalog').click()

    const header = page
      .getByTestId('admin-catalog-section-published')
      .getByRole('columnheader', { name: /книга/i })
      .first()
    await header.click()

    const sameLine = await header.locator('span').first().evaluate(node => {
      const children = Array.from(node.children)
      if (children.length < 2) return false
      const [label, arrow] = children.map(child => child.getBoundingClientRect())
      return Math.abs(label.top - arrow.top) <= 1
    })
    expect(sameLine).toBe(true)
  })

  // Авто-рост textarea под текст — одна и та же CSS-механика (auto-resize) в двух
  // местах админки. Проверяем обе вкладки (Теги и Интро) в одном тесте.
  test('textarea авто-растёт под введённый текст (теги и интро)', async ({ page }) => {
    await page.goto('/admin')
    await page.waitForLoadState('networkidle')

    // Вкладка «Теги»
    await page.getByRole('button', { name: /теги/i }).click()
    const tagTextarea = page.locator('textarea').first()
    await expect(tagTextarea).toBeVisible()
    const tagBefore = await tagTextarea.boundingBox()
    await tagTextarea.fill([
      'Первая строка',
      'Вторая строка',
      'Третья строка',
      'Четвертая строка',
      'Пятая строка',
      'Шестая строка',
      'Седьмая строка',
      'Восьмая строка',
    ].join('\n'))
    const tagAfter = await tagTextarea.boundingBox()
    expect(tagBefore).not.toBeNull()
    expect(tagAfter).not.toBeNull()
    expect(tagAfter!.height).toBeGreaterThan(tagBefore!.height)

    // Вкладка «Интро»
    await page.getByRole('button', { name: /^интро$/i }).click()
    const introTextarea = page.getByTestId('intro-header-body')
    await expect(introTextarea).toBeVisible()
    const introBefore = await introTextarea.boundingBox()
    await introTextarea.fill(['Первая строка интро', 'Вторая строка интро', 'Третья строка интро', 'Четвертая строка интро'].join('\n'))
    const introAfter = await introTextarea.boundingBox()
    expect(introBefore).not.toBeNull()
    expect(introAfter).not.toBeNull()
    expect(introAfter!.height).toBeGreaterThan(introBefore!.height)
  })
})

test.describe('Admin Catalog: section + editor layout', () => {
  const ADMIN_EMAIL = 'e2e-catalog-layout-admin@test.invalid'
  const ADMIN_NAME = 'E2E Catalog Layout Admin'
  let createdId: string | null = null

  test.beforeEach(async ({ page }) => {
    await page.request.post('/api/test/session', {
      data: { email: ADMIN_EMAIL, name: ADMIN_NAME, isAdmin: true },
    })
  })

  test.afterEach(async ({ page }) => {
    await page.request.post('/api/test/session', {
      data: { email: ADMIN_EMAIL, name: ADMIN_NAME, isAdmin: true },
    })
    if (createdId) {
      await page.request.patch(`/api/admin/books/${createdId}`, {
        data: { visibility: 'hidden' },
      })
      createdId = null
    }
    await page.request.delete('/api/test/session', { data: { email: ADMIN_EMAIL } })
  })

  test('inline-редактор раскрывается ниже строки книги и имеет ненулевой размер', async ({ page }) => {
    await page.goto('/admin')
    await page.waitForLoadState('networkidle')
    await page.getByTestId('admin-tab-catalog').click()

    // Создаём книгу-фикстуру, чтобы тест был детерминирован.
    await page.getByTestId('admin-books-create-toggle').click()
    const form = page.getByTestId('admin-books-create-form')
    const title = `UI Layout Book ${Date.now()}`
    await form.getByLabel('Название').fill(title)
    const createRes = page.waitForResponse(
      r => r.url().endsWith('/api/admin/books') && r.request().method() === 'POST'
    )
    await page.getByTestId('admin-books-create-submit').click()
    createdId = (await (await createRes).json()).data.id as string

    await page.reload()
    // AdminRefresh calls router.refresh() on mount which keeps network active;
    // wait for the tab to be visible instead of networkidle
    const catalogTabAfterReload = page.getByTestId('admin-tab-catalog')
    await expect(catalogTabAfterReload).toBeVisible({ timeout: 15_000 })
    await catalogTabAfterReload.click()

    const row = page.getByTestId(`admin-book-row-${createdId}`)
    await expect(row).toBeVisible({ timeout: 15_000 })
    await row.scrollIntoViewIfNeeded()

    // Открываем editor — он должен оказаться визуально под строкой и иметь ненулевую высоту.
    await page.getByTestId(`admin-book-expand-${createdId}`).click()
    const editor = page.getByTestId(`admin-book-editor-${createdId}`)
    await expect(editor).toBeVisible()
    await editor.scrollIntoViewIfNeeded()
    const editorBox = await editor.boundingBox()
    expect(editorBox).not.toBeNull()
    expect(editorBox!.height).toBeGreaterThan(100)
    const editorFollowsRow = await row.evaluate((rowEl, editorTestId) => {
      const editorEl = document.querySelector(`[data-testid="${editorTestId}"]`)
      return !!editorEl && !!(rowEl.compareDocumentPosition(editorEl) & Node.DOCUMENT_POSITION_FOLLOWING)
    }, `admin-book-editor-${createdId}`)
    expect(editorFollowsRow).toBe(true)
  })
})

test.describe('Satisfaction ranking gate layout', () => {
  test('satisfaction ranking gate fits one viewport (CTA visible without scroll)', async ({
    page,
    createMatchingSession,
    createTestBook,
    loginAsUser,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })

    const session = await createMatchingSession({
      minGroupSize: 3,
      maxGroupSize: 3,
    })
    const bookA = await createTestBook({ title: `UI Gate Book A ${Date.now()}`, author: 'Gate Author' })
    const bookB = await createTestBook({ title: `UI Gate Book B ${Date.now()}`, author: 'Gate Author' })

    // Two participants with complete rankings so the gate is reachable
    await loginAsUser({ name: 'UI Gate Peer One' })
    await joinMatchingSessionAndAddBooks(page, session.id, [bookA.id, bookB.id])
    await loginAsUser({ name: 'UI Gate Peer Two' })
    await joinMatchingSessionAndAddBooks(page, session.id, [bookA.id, bookB.id])

    // Third participant joins but has NOT submitted a ranking — should see the gate
    await loginAsUser({ name: 'UI Gate Viewer' })
    const joinRes = await page.request.post(`/api/matching/sessions/${session.id}/join`, {
      data: { name: 'UI Gate Viewer' },
    })
    expect(joinRes.ok()).toBe(true)
    const addRes = await page.request.post('/api/matching/books', { data: { bookId: bookA.id } })
    expect(addRes.ok()).toBe(true)

    await page.emulateMedia({ reducedMotion: 'reduce' })
    await page.goto('/matching')
    await page.waitForLoadState('networkidle')

    const gate = page.getByTestId('ranking-gate')
    await expect(gate).toBeVisible()
    const enter = page.getByTestId('ranking-gate-enter')
    const box = await enter.boundingBox()
    const viewport = page.viewportSize()!
    expect(box).not.toBeNull()
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1)
  })
})

test.describe('BookCardMobile: responsive layout', () => {
  test('на мобильном (390×800) каталог-мобайл виден, каталог-десктоп и переключатель вида скрыты', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // catalog-mobile виден: boundingBox не null и в области просмотра
    const mobileBox = await page.getByTestId('catalog-mobile').boundingBox()
    expect(mobileBox).not.toBeNull()
    expect(mobileBox!.height).toBeGreaterThan(0)

    // catalog-desktop скрыт: display none → boundingBox null
    const desktopBox = await page.getByTestId('catalog-desktop').boundingBox()
    expect(desktopBox).toBeNull()

    // filters-view-toggle скрыт
    const toggleBox = await page.locator('.filters-view-toggle').boundingBox()
    expect(toggleBox).toBeNull()

    // В мобильном каталоге присутствует хотя бы одна мобильная карточка
    const cards = page.getByTestId('book-card-mobile')
    expect(await cards.count()).toBeGreaterThan(0)
  })

  test('на десктопе (1280×900) каталог-десктоп виден, каталог-мобайл скрыт', async ({ page }) => {
    await page.setViewportSize({ width: 1280, height: 900 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    // catalog-desktop виден
    const desktopBox = await page.getByTestId('catalog-desktop').boundingBox()
    expect(desktopBox).not.toBeNull()
    expect(desktopBox!.height).toBeGreaterThan(0)

    // catalog-mobile скрыт: display none → boundingBox null
    const mobileBox = await page.getByTestId('catalog-mobile').boundingBox()
    expect(mobileBox).toBeNull()

    // переключатель вида виден на десктопе
    const toggleBox = await page.locator('.filters-view-toggle').boundingBox()
    expect(toggleBox).not.toBeNull()
  })
})

test.describe('AuthErrorBanner: conditional render', () => {
  test('баннер виден на /?auth=failed и скрыт на /', async ({ page }) => {
    // Переход на /?auth=failed — баннер должен отображаться
    await page.goto('/?auth=failed')
    await page.waitForLoadState('networkidle')
    const banner = page.getByTestId('auth-error-banner')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('Не получилось войти через Telegram')

    // Переход на / без параметра — баннера нет
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await expect(page.getByTestId('auth-error-banner')).toHaveCount(0)
  })
})

test.describe('ProfileDrawer: status accordion menu', () => {
  const EMAIL = 'e2e-mybooks-ui@test.invalid'
  const NAME = 'E2E MyBooks UI'
  const TG = 'e2e_mybooks_ui_tg'

  test('menu opens below tapped row and toggles closed on second tap', async ({ page, createTestBook }) => {
    await page.request.post('/api/test/session', {
      data: { email: EMAIL, name: NAME, telegramUsername: TG, provider: 'telegram-preauth' },
    })
    try {
      const book = await createTestBook({ title: 'E2E Accordion Book' })
      await page.request.post('/api/test/signup', {
        data: { userId: 'placeholder', name: NAME, email: EMAIL, contacts: '@' + TG, telegramUsername: TG, selectedBookIds: [book.id] },
      })
      await page.goto('/')
      await page.waitForLoadState('networkidle')
      await page.getByRole('button', { name: NAME }).click()
      const dialog = page.getByRole('dialog')
      await expect(dialog).toBeVisible()

      const row = dialog.locator(`[data-book-id="${book.id}"]`)
      await expect(row).toBeVisible()
      await expect(dialog.locator('[data-testid="status-menu"]')).toHaveCount(0)

      const rowBox = await row.boundingBox()
      expect(rowBox).not.toBeNull()

      await row.click()
      const menu = dialog.locator('[data-testid="status-menu"]')
      await expect(menu).toBeVisible()
      const menuBox = await menu.boundingBox()
      expect(menuBox).not.toBeNull()
      // menu is positioned BELOW the row (its top edge is >= row's bottom edge)
      expect(menuBox!.y).toBeGreaterThanOrEqual(rowBox!.y + rowBox!.height - 1)

      // Second tap on same row closes the menu
      await row.click()
      await expect(menu).toHaveCount(0)
    } finally {
      await page.request.delete('/api/test/session', {
        data: { email: EMAIL, provider: 'telegram-preauth', telegramUsername: TG },
      })
    }
  })
})

test.describe('ProfileDrawer: auth methods layout', () => {
  const NAME = 'E2E Auth Methods UI'

  test('telegram-only auth methods show a useful linked state without unlink controls', async ({ page, request }) => {
    test.setTimeout(180_000)
    const providerAccountId = `tg-auth-methods-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    await page.setViewportSize({ width: 390, height: 844 })
    const sessionResponse = await page.request.post('/api/test/session', {
      data: { name: NAME, provider: 'telegram-preauth', providerAccountId },
    })
    expect(sessionResponse.ok()).toBe(true)
    const sessionBody = await sessionResponse.json() as { userId: string }
    const profileResponse = await page.request.post('/api/test/signup', {
      data: {
        userId: sessionBody.userId,
        name: NAME,
        contacts: '@e2e_auth_ui',
        selectedBookIds: [],
      },
    })
    expect(profileResponse.ok()).toBe(true)
    try {
      await page.goto('/')
      await page.waitForLoadState('networkidle')
      const profileButton = page.locator('.nd-header-avatar')
      await expect(profileButton).toBeVisible({ timeout: 20_000 })
      await profileButton.click({ timeout: 10_000 })
      const dialog = page.getByRole('dialog', { name: 'Личный кабинет' })
      await expect(dialog).toBeVisible({ timeout: 20_000 })
      await dialog.getByRole('button', { name: 'Профиль' }).click()

      const section = dialog.getByTestId('auth-methods-section')
      const telegramMethod = dialog.getByTestId('auth-method-telegram')
      const googleMethod = dialog.getByTestId('auth-method-google')
      await expect(section).toBeVisible({ timeout: 20_000 })
      await expect(telegramMethod).toBeVisible({ timeout: 20_000 })
      await expect(telegramMethod).toContainText('Telegram ID привязан')
      await expect(telegramMethod).toContainText('последний вход')
      await expect(googleMethod).toContainText('не привязан')
      const emailMethod = dialog.getByTestId('auth-method-email')
      await page.route('**/api/account/identities/email', route => route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true }),
      }))
      await emailMethod.getByRole('button', { name: /привязать/i }).click()
      await emailMethod.getByLabel(/email для привязки/i).fill('e2e-link-email@test.invalid')
      await emailMethod.getByRole('button', { name: /получить ссылку/i }).click()
      await expect(emailMethod).toContainText('Проверьте почту')
      await expect(section.getByText('—')).toHaveCount(0)
      await expect(section.getByRole('button', { name: /отвязать/i })).toHaveCount(0)

      const dialogBox = await dialog.boundingBox()
      const sectionBox = await section.boundingBox()
      const telegramBox = await telegramMethod.boundingBox()
      const emailBox = await emailMethod.boundingBox()
      expect(dialogBox).not.toBeNull()
      expect(sectionBox).not.toBeNull()
      expect(telegramBox).not.toBeNull()
      expect(emailBox).not.toBeNull()
      expect(sectionBox!.x).toBeGreaterThanOrEqual(dialogBox!.x - 1)
      expect(sectionBox!.x + sectionBox!.width).toBeLessThanOrEqual(dialogBox!.x + dialogBox!.width + 1)
      expect(telegramBox!.x).toBeGreaterThanOrEqual(sectionBox!.x - 1)
      expect(telegramBox!.x + telegramBox!.width).toBeLessThanOrEqual(sectionBox!.x + sectionBox!.width + 1)
      expect(emailBox!.x).toBeGreaterThanOrEqual(sectionBox!.x - 1)
      expect(emailBox!.x + emailBox!.width).toBeLessThanOrEqual(sectionBox!.x + sectionBox!.width + 1)
    } finally {
      await page.goto('about:blank').catch(() => {})
      await request.delete('/api/test/session', {
        data: { provider: 'telegram-preauth', providerAccountId },
        timeout: 15_000,
      }).catch(() => {})
    }
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
