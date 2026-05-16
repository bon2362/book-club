import { test, expect } from '@playwright/test'
import { epic, feature } from 'allure-js-commons'

const ADMIN_EMAIL = 'e2e-intro-admin@test.invalid'
const ADMIN_NAME = 'E2E Intro Admin'
const USER_EMAIL = 'e2e-intro-user@test.invalid'

test.describe('AdminPanel — вкладка «Интро»', () => {
  test.setTimeout(120_000)

  test.beforeEach(async ({ page }) => {
    await epic('Администрирование')
    await feature('Редактирование интро')
    await page.request.post('/api/test/session', {
      data: { email: ADMIN_EMAIL, name: ADMIN_NAME, isAdmin: true },
    })
  })

  test.afterEach(async ({ page }) => {
    await page.request.delete('/api/test/session', { data: { email: ADMIN_EMAIL } })
    await page.request.delete('/api/test/session', { data: { email: USER_EMAIL } })
  })

  test('админ меняет вопрос секции — изменение сохраняется после reload и видно на главной', async ({ page }) => {
    await page.goto('/admin')
    await page.waitForLoadState('networkidle')

    await page.getByRole('button', { name: /^интро$/i }).click()
    await expect(page.getByTestId('intro-editor')).toBeVisible()

    // Ждём загрузку данных
    const firstSection = page.locator('[data-testid^="intro-section-"]').first()
    await expect(firstSection).toBeVisible()

    const questionInput = firstSection.locator('[data-testid^="intro-question-"]')
    const originalQuestion = await questionInput.inputValue()
    const newQuestion = `E2E вопрос ${Date.now()}`

    await questionInput.fill(newQuestion)
    await page.getByTestId('intro-save').click()
    await expect(page.getByTestId('intro-msg')).toHaveText('Сохранено')

    // Reload — изменение сохранилось в БД
    await page.reload()
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: /^интро$/i }).click()
    await expect(page.getByTestId('intro-editor')).toBeVisible()
    const firstAfterReload = page.locator('[data-testid^="intro-section-"]').first()
    await expect(firstAfterReload.locator('[data-testid^="intro-question-"]')).toHaveValue(newQuestion)

    // На главной новый текст виден в аккордеоне
    await page.goto('/')
    await page.waitForLoadState('networkidle')
    await page.getByText('Подробнее ↓').click()
    await expect(page.getByText(newQuestion)).toBeVisible()

    // Возвращаем оригинал
    await page.goto('/admin')
    await page.waitForLoadState('networkidle')
    await page.getByRole('button', { name: /^интро$/i }).click()
    const firstCleanup = page.locator('[data-testid^="intro-section-"]').first()
    await firstCleanup.locator('[data-testid^="intro-question-"]').fill(originalQuestion)
    await page.getByTestId('intro-save').click()
    await expect(page.getByTestId('intro-msg')).toHaveText('Сохранено')
  })

  test('[SEC] обычный пользователь не может редактировать интро', async ({ page }) => {
    await page.request.post('/api/test/session', {
      data: { email: USER_EMAIL, name: 'Plain User' },
    })

    const getRes = await page.request.get('/api/admin/intro')
    expect(getRes.status()).toBe(403)

    const putRes = await page.request.put('/api/admin/intro', {
      data: { patches: [{ id: 'fake', title: 'hax' }] },
    })
    expect(putRes.status()).toBe(403)

    const postRes = await page.request.post('/api/admin/intro')
    expect(postRes.status()).toBe(403)
  })
})
