import { test, expect } from '@playwright/test'
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
    await page.waitForTimeout(350)
    expect(await isFullyAboveViewport(page, 'header')).toBe(true)
  })

  test('filter bar hides together with header on scroll down', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => window.scrollTo({ top: 300, behavior: 'instant' }))
    await page.waitForTimeout(350)
    const filterBox = await page.locator('.filters-bar').boundingBox()
    expect(filterBox!.y + filterBox!.height).toBeLessThanOrEqual(0)
  })

  test('header and filters reappear on scroll up', async ({ page }) => {
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.evaluate(() => window.scrollTo({ top: 300, behavior: 'instant' }))
    await page.waitForTimeout(350)
    await page.evaluate(() => window.scrollTo({ top: 100, behavior: 'instant' }))
    await page.waitForTimeout(350)
    expect(await isFullyVisible(page, 'header')).toBe(true)
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
    await page.getByLabel('Поиск пользователей').fill(USER_EMAIL)
    await page.locator('tr').filter({ hasText: USER_EMAIL }).click()
    await page.waitForTimeout(350)

    const box = await page.getByRole('dialog').boundingBox()
    const viewport = page.viewportSize()!
    expect(box).not.toBeNull()
    expect(box!.width).toBeLessThanOrEqual(640)
    expect(box!.x + box!.width).toBeLessThanOrEqual(viewport.width + 1)
    expect(box!.x).toBeGreaterThanOrEqual(Math.max(0, viewport.width - 641))
  })
})
