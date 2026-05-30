import { test, expect } from './fixtures'
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

  // По умолчанию grid (article-карточки), клик переключает в table и обратно.
  // Покрывает прежние 4 теста: дефолт-grid, наличие кнопки, grid→table, table→grid.
  test('тоггл переключает grid ↔ table в обе стороны', async ({ page }) => {
    // дефолт — сетка
    await expect(page.locator('article').first()).toBeVisible()

    // grid → table
    await page.locator('button[title="Переключить в таблицу"]').click()
    await expect(page.locator('table')).toBeVisible()
    await expect(page.locator('article')).toHaveCount(0)

    // table → grid
    await page.locator('button[title="Переключить в сетку"]').click()
    await expect(page.locator('article').first()).toBeVisible()
    await expect(page.locator('table')).toHaveCount(0)
  })

  // Персистентность: выбранный вид пишется в localStorage и восстанавливается
  // после reload. Покрывает прежние 2 теста (localStorage + восстановление).
  test('выбранный вид сохраняется после перезагрузки страницы', async ({ page }) => {
    await page.locator('button[title="Переключить в таблицу"]').click()
    await expect(page.locator('table')).toBeVisible()
    expect(await page.evaluate(() => localStorage.getItem('book_view_mode'))).toBe('list')

    await page.reload()
    await page.waitForSelector('table')
    await expect(page.locator('table')).toBeVisible()
    await expect(page.locator('article')).toHaveCount(0)
  })
})
