import { test, expect } from './fixtures'
import { epic, feature } from 'allure-js-commons'

// cookie key: 'book_view_mode', values: 'grid' | 'list'
// Хранится в cookie (а не localStorage), чтобы сервер рендерил нужный вид
// сразу и вёрстка не дёргалась после гидратации (CLS).
// Кнопка переключения: title меняется в зависимости от текущего вида

test.describe('переключение вида отображения', () => {
  test.beforeEach(async ({ page }) => {
    await epic('UI')
    await feature('Режим просмотра')
    await page.context().clearCookies()
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

  // Персистентность: выбранный вид пишется в cookie и восстанавливается
  // после reload. Покрывает прежние 2 теста (cookie + восстановление).
  test('выбранный вид сохраняется после перезагрузки страницы', async ({ page }) => {
    await page.locator('button[title="Переключить в таблицу"]').click()
    await expect(page.locator('table')).toBeVisible()
    const cookies = await page.context().cookies()
    expect(cookies.find(c => c.name === 'book_view_mode')?.value).toBe('list')

    await page.reload()
    await page.waitForSelector('table')
    await expect(page.locator('table')).toBeVisible()
    await expect(page.locator('article')).toHaveCount(0)
  })
})
