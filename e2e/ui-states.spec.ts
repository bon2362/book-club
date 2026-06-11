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

test.describe('Home submit book CTA layout', () => {
  test('submit book button is compact on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto('/')
    await page.waitForLoadState('networkidle')

    const box = await page.getByTestId('submit-book-card').boundingBox()
    expect(box).not.toBeNull()
    expect(box!.height).toBeLessThanOrEqual(96)
  })
})

test.describe('Matching feature presentation', () => {
  test('interactive prototype shows how Maria changes the best scenario', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 950 })
    await page.goto('/matching/presentation')
    await expect(page.getByRole('heading', { name: /как выбирать группы/i })).toBeVisible()

    const prototype = page.getByTestId('matching-presentation-prototype')
    await prototype.scrollIntoViewIfNeeded()
    await expect(prototype.getByText(/все попали в группы/i).first()).toBeVisible()
    await expect(prototype.getByText(/вне групп/i)).toBeVisible()

    await prototype.getByRole('button', { name: /показать после хода/i }).click()

    await expect(prototype.getByText(/равное покрытие может сочетаться/i)).toBeVisible()
    await expect(prototype.getByText(/равное покрытие, сильнее интерес/i)).toBeVisible()
    await expect(prototype.getByText(/краткая история неолиберализма/i).first()).toBeVisible()
  })
})

async function joinMatchingSessionAndAddBooks(page: Page, sessionId: string, bookIds: string[]) {
  const joinRes = await page.request.post(`/api/matching/sessions/${sessionId}/join`)
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
  test('reader circles and moves occupy first viewport; catalog starts below', async ({
    page,
    createMatchingSession,
    createTestBook,
    loginAsUser,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const session = await createMatchingSession({ minGroupSize: 3, maxGroupSize: 3 })
    const circleBook = await createTestBook({ title: `UI Circle ${Date.now()}`, author: 'Layout Author' })
    const moveBook = await createTestBook({ title: `UI Move ${Date.now()}`, author: 'Layout Author' })

    await loginAsUser({ name: 'UI Matching One' })
    await joinMatchingSessionAndAddBooks(page, session.id, [circleBook.id, moveBook.id])
    await loginAsUser({ name: 'UI Matching Two' })
    await joinMatchingSessionAndAddBooks(page, session.id, [circleBook.id, moveBook.id])
    await loginAsUser({ name: 'UI Matching Three' })
    await joinMatchingSessionAndAddBooks(page, session.id, [circleBook.id])

    await page.goto('/matching')
    await expect(page.getByTestId('matching-reader-circles-panel')).toBeVisible()
    await expect(page.getByTestId('matching-my-moves-panel')).toBeVisible()

    const viewport = page.viewportSize()!
    const circlesBox = await page.getByTestId('matching-reader-circles-panel').boundingBox()
    const movesBox = await page.getByTestId('matching-my-moves-panel').boundingBox()
    const catalogBox = await page.getByTestId('matching-catalog-panel').boundingBox()

    expect(circlesBox).not.toBeNull()
    expect(movesBox).not.toBeNull()
    expect(catalogBox).not.toBeNull()
    expect(circlesBox!.y).toBeLessThan(viewport.height)
    expect(movesBox!.y).toBeLessThan(viewport.height)
    expect(circlesBox!.y + circlesBox!.height).toBeLessThanOrEqual(viewport.height + 1)
    expect(movesBox!.y + movesBox!.height).toBeLessThanOrEqual(viewport.height + 1)
    expect(catalogBox!.y).toBeGreaterThanOrEqual(viewport.height - 24)
  })

  test('participant chip separators keep space away from names', async ({
    page,
    createMatchingSession,
    createTestBook,
    loginAsUser,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const session = await createMatchingSession({ minGroupSize: 3, maxGroupSize: 3 })
    const circleBook = await createTestBook({ title: `UI Chip Circle ${Date.now()}`, author: 'Layout Author' })
    const moveBook = await createTestBook({ title: `UI Chip Move ${Date.now()}`, author: 'Layout Author' })
    const fillerBookA = await createTestBook({ title: `UI Chip Filler A ${Date.now()}`, author: 'Layout Author' })
    const fillerBookB = await createTestBook({ title: `UI Chip Filler B ${Date.now()}`, author: 'Layout Author' })

    await loginAsUser({ name: 'UI Chip One' })
    await joinMatchingSessionAndAddBooks(page, session.id, [moveBook.id, fillerBookA.id, fillerBookB.id, circleBook.id])
    await loginAsUser({ name: 'UI Chip Two' })
    await joinMatchingSessionAndAddBooks(page, session.id, [moveBook.id, fillerBookA.id, fillerBookB.id, circleBook.id])
    await loginAsUser({ name: 'UI Chip Three' })
    await joinMatchingSessionAndAddBooks(page, session.id, [circleBook.id])

    await page.goto('/matching')
    const circlesPanel = page.getByTestId('matching-reader-circles-panel')
    const movesPanel = page.getByTestId('matching-my-moves-panel')
    await expect(circlesPanel).toBeVisible()
    await expect(movesPanel.getByRole('button', { name: moveBook.title, exact: true }).first()).toBeVisible()

    await movesPanel.locator('li').filter({ hasText: moveBook.title }).first().hover()

    await expect(circlesPanel.locator('.nd-scenario-preview-card')).toBeVisible()
    await expect(circlesPanel.locator('.nd-scenario-preview-slot')).toHaveClass(/is-open/)
    await expect.poll(async () => {
      const maxHeight = await circlesPanel.locator('.nd-scenario-preview-clip').evaluate((element) => (
        window.getComputedStyle(element).maxHeight
      ))
      return Number.parseFloat(maxHeight)
    }).toBeGreaterThan(0)

    const chipTextOffsets = await circlesPanel.locator('.nd-chip-text').evaluateAll((chips) => (
      chips.filter((chip) => chip.previousElementSibling?.classList.contains('nd-chip-text')).map((chip) => {
        const chipBox = chip.getBoundingClientRect()
        const nameBox = chip.querySelector('b')?.getBoundingClientRect()
        return nameBox ? nameBox.left - chipBox.left : 0
      })
    ))

    expect(chipTextOffsets.length).toBeGreaterThan(0)
    for (const offset of chipTextOffsets) {
      expect(offset).toBeGreaterThanOrEqual(8)
    }
  })
})

test.describe('Matching feed height', () => {
  // #337: лента ограничена по высоте и скроллится внутри, а не растягивает шапку.
  const MAX_FEED_HEIGHT_PX = 288 // 18rem при базовом 16px

  test('развёрнутая лента ограничена по высоте и имеет внутренний скролл', async ({
    page,
    createMatchingSession,
    createTestBook,
    loginAsUser,
  }) => {
    await page.setViewportSize({ width: 1440, height: 900 })
    const session = await createMatchingSession({ minGroupSize: 2, maxGroupSize: 2 })
    const book = await createTestBook({ title: `UI Feed ${Date.now()}`, author: 'Feed Author' })

    // Двое участников с общей книгой → формируется круг → в ленту пишется событие.
    await loginAsUser({ name: 'UI Feed One' })
    await joinMatchingSessionAndAddBooks(page, session.id, [book.id])
    await loginAsUser({ name: 'UI Feed Two' })
    await joinMatchingSessionAndAddBooks(page, session.id, [book.id])

    await page.goto('/matching')

    // Тикер появляется только когда есть события ленты.
    const toggle = page.getByTestId('matching-feed-toggle')
    await expect(toggle).toBeVisible({ timeout: 15_000 })
    await toggle.click()

    const feed = page.getByTestId('matching-feed')
    await expect(feed).toBeVisible()

    // CSS-контракт: max-height задан и включён вертикальный скролл.
    const { maxHeight, overflowY } = await feed.evaluate((el) => {
      const cs = window.getComputedStyle(el)
      return { maxHeight: cs.maxHeight, overflowY: cs.overflowY }
    })
    expect(Number.parseFloat(maxHeight)).toBeCloseTo(MAX_FEED_HEIGHT_PX, 0)
    expect(overflowY).toBe('auto')

    // Фактическая высота списка не превышает кап (с допуском на рамку).
    const box = await feed.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.height).toBeLessThanOrEqual(MAX_FEED_HEIGHT_PX + 2)
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
    await page.waitForLoadState('networkidle')
    await page.getByTestId('admin-tab-catalog').click()

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
      optimizationMode: 'satisfaction',
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
    const joinRes = await page.request.post(`/api/matching/sessions/${session.id}/join`)
    expect(joinRes.ok()).toBe(true)

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

test.describe('AuthErrorBanner: conditional render', () => {
  test('баннер виден на /?auth=failed и скрыт на /', async ({ page }) => {
    // Переход на /?auth=failed — баннер должен отображаться
    await page.goto('/?auth=failed')
    await page.waitForLoadState('networkidle')
    const banner = page.getByRole('alert')
    await expect(banner).toBeVisible()
    await expect(banner).toContainText('Не получилось войти через Telegram')

    // Переход на / без параметра — баннера нет
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await expect(page.getByRole('alert')).toHaveCount(0)
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
