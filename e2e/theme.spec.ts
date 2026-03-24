import { test, expect } from '@playwright/test'
import { epic, feature } from 'allure-js-commons'

// Тема переключения в текущей версии не реализована в UI.
// Тесты документируют текущее состояние и сработают как регрессия
// при добавлении theme toggle.

test.describe('тема (dark/light)', () => {
  test.beforeEach(async () => {
    await epic('UI')
    await feature('Тема')
  })

  test('на странице нет кнопки переключения темы', async ({ page }) => {
    await page.goto('/')
    const themeToggle = page.locator(
      '[title*="тём"], [title*="свет"], [aria-label*="theme"], [aria-label*="тем"], [aria-label*="dark"], [aria-label*="light"]'
    )
    await expect(themeToggle).toHaveCount(0)
  })

  test('html-элемент не имеет класса dark по умолчанию', async ({ page }) => {
    await page.goto('/')
    const htmlClass = await page.locator('html').getAttribute('class')
    expect(htmlClass ?? '').not.toContain('dark')
  })
})
