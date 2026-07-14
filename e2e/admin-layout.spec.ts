import { test, expect } from './fixtures'
import { epic, feature } from 'allure-js-commons'

test.beforeEach(async () => {
  await epic('UI')
  await feature('Состояния интерфейса')
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
