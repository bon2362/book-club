import { test, expect } from './fixtures'
import { epic, feature } from 'allure-js-commons'

test.beforeEach(async () => {
  await epic('UI')
  await feature('Страница 404')
})

const MISSING = '/net-takoi-stranicy-404'

test('404 на десктопе: разворот в две колонки, обрывок справа', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 760 })
  const response = await page.goto(MISSING)
  expect(response?.status()).toBe(404)

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Эту страницукто-то вырвал.')

  const prev = await page.locator('.nf-prev').boundingBox()
  const torn = await page.locator('.nf-torn').boundingBox()
  expect(prev && torn).toBeTruthy()
  // Колонки стоят рядом, обрывок шире (1fr : 1.3fr) и на всю высоту экрана
  expect(torn!.x).toBeGreaterThanOrEqual(prev!.x + prev!.width - 1)
  expect(Math.abs(torn!.y - prev!.y)).toBeLessThan(1)
  expect(torn!.width).toBeGreaterThan(prev!.width)
  expect(torn!.height).toBeGreaterThanOrEqual(759)

  const btn = await page.getByRole('link', { name: /К оглавлению/ }).boundingBox()
  expect(btn!.x).toBeGreaterThan(torn!.x)
  expect(btn!.y + btn!.height).toBeLessThanOrEqual(760)
})

test('404 на телефоне: обрывок снизу, кнопка во всю ширину прижата вниз и ведёт на главную', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(MISSING)

  const prev = await page.locator('.nf-prev').boundingBox()
  const torn = await page.locator('.nf-torn').boundingBox()
  expect(torn!.y).toBeGreaterThanOrEqual(prev!.y + prev!.height)
  expect(torn!.width).toBeGreaterThanOrEqual(389)

  const link = page.getByRole('link', { name: /К оглавлению/ })
  const btn = await link.boundingBox()
  expect(btn!.height).toBeGreaterThanOrEqual(48)
  expect(btn!.width).toBeGreaterThan(300)
  expect(btn!.y + btn!.height).toBeLessThanOrEqual(844)
  expect(btn!.y + btn!.height).toBeGreaterThan(844 - 80)

  await link.click()
  await expect(page).toHaveURL(/\/$/)
})
