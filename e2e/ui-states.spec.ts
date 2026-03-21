import { test, expect } from '@playwright/test'

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
