import { test, expect } from './fixtures'

test('admin gallery page renders species photos', async ({ page, loginAsAdmin }) => {
  await loginAsAdmin()
  await page.goto('/admin/gallery')
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('heading', { name: 'Галерея фото видов' })).toBeVisible()
  expect(await page.locator('main img').count()).toBeGreaterThan(0)
})

test('admin sitemap page lists site routes', async ({ page, loginAsAdmin }) => {
  await loginAsAdmin()
  await page.goto('/admin/sitemap')
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('heading', { name: 'Карта сайта' })).toBeVisible()
  await expect(page.getByRole('link', { name: '/matching', exact: true })).toBeVisible()
})

test('admin gallery and sitemap redirect non-admins', async ({ page, loginAsUser }) => {
  await loginAsUser({ name: 'E2E Non-Admin' })
  await page.goto('/admin/gallery')
  await expect(page).toHaveURL(/\/$/)
  await page.goto('/admin/sitemap')
  await expect(page).toHaveURL(/\/$/)
})
