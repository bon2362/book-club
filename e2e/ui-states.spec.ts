import { test, expect } from './fixtures'
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

test.describe('Header: hide on scroll down', () => {
  test('header visible at top of page', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    expect(await isFullyVisible(page, 'header')).toBe(true)
  })

  test('header hides after scrolling down past threshold', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => window.scrollTo({ top: 300, behavior: 'instant' }))
    await expect.poll(() => isFullyAboveViewport(page, 'header'), { timeout: 1500 }).toBe(true)
  })

  test('filter bar hides together with header on scroll down', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => window.scrollTo({ top: 300, behavior: 'instant' }))
    await expect.poll(() => isFullyAboveViewportByLocator(page.locator('.filters-bar')), { timeout: 1500 }).toBe(true)
  })

  test('header and filters reappear on scroll up', async ({ page }) => {
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
    await page.getByRole('button', { name: /по книгам/i }).click()

    const header = page.getByRole('columnheader', { name: /книга/i })
    await header.click()

    const sameLine = await header.locator('span').first().evaluate(node => {
      const children = Array.from(node.children)
      if (children.length < 2) return false
      const [label, arrow] = children.map(child => child.getBoundingClientRect())
      return Math.abs(label.top - arrow.top) <= 1
    })
    expect(sameLine).toBe(true)
  })

  test('tag description textarea grows to fit entered text', async ({ page }) => {
    await page.goto('/admin')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: /теги/i }).click()

    const textarea = page.locator('textarea').first()
    await expect(textarea).toBeVisible()
    const before = await textarea.boundingBox()
    await textarea.fill([
      'Первая строка',
      'Вторая строка',
      'Третья строка',
      'Четвертая строка',
      'Пятая строка',
      'Шестая строка',
      'Седьмая строка',
      'Восьмая строка',
    ].join('\n'))
    const after = await textarea.boundingBox()

    expect(before).not.toBeNull()
    expect(after).not.toBeNull()
    expect(after!.height).toBeGreaterThan(before!.height)
  })

  test('intro body textarea grows to fit entered text', async ({ page }) => {
    await page.goto('/admin')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: /^интро$/i }).click()

    const textarea = page.getByTestId('intro-header-body')
    await expect(textarea).toBeVisible()
    const before = await textarea.boundingBox()
    await textarea.fill(['Первая строка интро', 'Вторая строка интро', 'Третья строка интро', 'Четвертая строка интро'].join('\n'))
    const after = await textarea.boundingBox()

    expect(before).not.toBeNull()
    expect(after).not.toBeNull()
    expect(after!.height).toBeGreaterThan(before!.height)
  })
})
