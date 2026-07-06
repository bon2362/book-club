import { test, expect } from './fixtures'

// The species-photo pseudonym gallery (/admin/gallery) was removed together with
// pseudonyms in the matching simplification (#431). Only the sitemap page remains.

test('admin sitemap page lists site routes', async ({ page, loginAsAdmin }) => {
  await loginAsAdmin()
  await page.goto('/admin/sitemap')
  await page.waitForLoadState('networkidle')
  await expect(page.getByRole('heading', { name: 'Карта сайта' })).toBeVisible()
  await expect(page.getByRole('link', { name: '/matching', exact: true })).toBeVisible()
})

test('admin sitemap redirects non-admins', async ({ page, loginAsUser }) => {
  await loginAsUser({ name: 'E2E Non-Admin' })
  await page.goto('/admin/sitemap')
  await expect(page).toHaveURL(/\/$/)
})
