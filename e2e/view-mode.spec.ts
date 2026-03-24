import { test, expect } from '@playwright/test'
import { epic, feature } from 'allure-js-commons'

// localStorage key: 'book_view_mode', values: 'grid' | 'list'
// Кнопка переключения: title меняется в зависимости от текущего вида

test.describe('переключение вида отображения', () => {
  test.beforeEach(async ({ page }) => {
    await epic('UI')
    await feature('Режим просмотра')
    await page.goto('/')
    await page.evaluate(() => localStorage.removeItem('book_view_mode'))
    await page.goto('/')
    await page.waitForSelector('article')
  })

  test('по умолчанию отображается сетка (grid)', async ({ page }) => {
    await expect(page.locator('article').first()).toBeVisible()
  })

  test('кнопка переключения вида присутствует', async ({ page }) => {
    await expect(page.locator('button[title="Переключить в таблицу"]')).toBeVisible()
  })

  test('клик переключает в табличный вид', async ({ page }) => {
    await page.locator('button[title="Переключить в таблицу"]').click()
    await expect(page.locator('table')).toBeVisible()
    await expect(page.locator('article')).toHaveCount(0)
  })

  test('повторный клик возвращает в сетку', async ({ page }) => {
    await page.locator('button[title="Переключить в таблицу"]').click()
    await expect(page.locator('table')).toBeVisible()
    await page.locator('button[title="Переключить в сетку"]').click()
    await expect(page.locator('article').first()).toBeVisible()
    await expect(page.locator('table')).toHaveCount(0)
  })

  test('выбранный вид сохраняется в localStorage', async ({ page }) => {
    await page.locator('button[title="Переключить в таблицу"]').click()
    const stored = await page.evaluate(() => localStorage.getItem('book_view_mode'))
    expect(stored).toBe('list')
  })

  test('вид восстанавливается после перезагрузки страницы', async ({ page }) => {
    await page.locator('button[title="Переключить в таблицу"]').click()
    await expect(page.locator('table')).toBeVisible()
    await page.reload()
    await page.waitForSelector('table')
    await expect(page.locator('table')).toBeVisible()
    await expect(page.locator('article')).toHaveCount(0)
  })
})
