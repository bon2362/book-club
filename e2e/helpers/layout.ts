import type { Locator, Page } from '@playwright/test'

export async function isFullyAboveViewport(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox()
  if (!box) return true
  return box.y + box.height <= 0
}

export async function isFullyVisible(page: Page, selector: string) {
  const box = await page.locator(selector).boundingBox()
  if (!box) return false
  return box.y >= 0 && box.y < page.viewportSize()!.height
}

export async function isFullyAboveViewportByLocator(locator: Locator) {
  const box = await locator.boundingBox()
  if (!box) return true
  return box.y + box.height <= 0
}
