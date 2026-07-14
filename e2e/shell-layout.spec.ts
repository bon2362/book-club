import { test, expect } from './fixtures'
import { epic, feature } from 'allure-js-commons'

import { isFullyAboveViewport, isFullyAboveViewportByLocator, isFullyVisible } from './helpers/layout'

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
