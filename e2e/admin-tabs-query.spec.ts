import { test, expect } from './fixtures'

const ADMIN_EMAIL = 'e2e-admin-tabs-query@test.invalid'
const ADMIN_NAME = 'E2E Admin Tabs Query'

test.describe('AdminPanel — вкладки в query', () => {
  test.beforeEach(async ({ page }) => {
    await page.request.post('/api/test/session', {
      data: { email: ADMIN_EMAIL, name: ADMIN_NAME, isAdmin: true },
    })
  })

  test.afterEach(async ({ page }) => {
    await page.request.delete('/api/test/session', { data: { email: ADMIN_EMAIL } })
  })

  test('открывает вкладку из tab и обновляет URL при клике', async ({ page }) => {
    await page.goto('/admin?tab=feedback')
    await page.waitForLoadState('networkidle')

    await expect(page.getByLabel('Поиск фидбеков')).toBeVisible()
    await expect(page).toHaveURL(/\/admin\?tab=feedback$/)

    await page.getByRole('button', { name: /^интро$/i }).click()

    await expect(page).toHaveURL(/\/admin\?tab=intro$/)
    await expect(page.getByTestId('intro-editor')).toBeVisible()
  })

  test('некорректный tab возвращает на участников', async ({ page }) => {
    await page.goto('/admin?tab=unknown&from=e2e')
    await page.waitForLoadState('networkidle')

    await expect(page).toHaveURL(/\/admin\?tab=users&from=e2e$/)
    await expect(page.getByLabel('Поиск пользователей')).toBeVisible()
  })
})
