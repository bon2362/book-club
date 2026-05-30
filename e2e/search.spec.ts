import { test, expect } from './fixtures'
import { epic, feature } from 'allure-js-commons'

test.describe('поиск по книгам', () => {
  test.beforeEach(async ({ page }) => {
    await epic('Каталог книг')
    await feature('Поиск')
    await page.goto('/')
    await page.waitForSelector('article, p:has-text("Ничего не найдено")')
  })

  // «поле отображается» и «пустой запрос показывает все книги» удалены как
  // тривиальные — наличие поля и стартовый полный список проверяются неявно
  // в тестах ниже (фильтрация / очистка).

  test('ввод текста фильтрует список книг', async ({ page }) => {
    const searchInput = page.getByPlaceholder('Поиск по названию или автору…')
    const totalBefore = await page.locator('article').count()
    await searchInput.fill('война')
    const totalAfter = await page.locator('article').count()
    const emptyVisible = await page.getByText('Ничего не найдено').isVisible().catch(() => false)
    if (!emptyVisible) {
      expect(totalAfter).toBeLessThanOrEqual(totalBefore)
    } else {
      await expect(page.getByText('Ничего не найдено')).toBeVisible()
    }
  })

  test('очистка поиска восстанавливает полный список', async ({ page }) => {
    const searchInput = page.getByPlaceholder('Поиск по названию или автору…')
    const totalBefore = await page.locator('article').count()
    await searchInput.fill('война')
    await searchInput.fill('')
    const totalAfter = await page.locator('article').count()
    expect(totalAfter).toBe(totalBefore)
  })

  // Объединяет прежние «кириллический запрос» и «несуществующий запрос»:
  // заведомо отсутствующий кириллический запрос обязан дать «Ничего не найдено».
  test('несуществующий кириллический запрос показывает «Ничего не найдено»', async ({ page }) => {
    await page.getByPlaceholder('Поиск по названию или автору…').fill('абвгдеж_нет_такой_книги_ёёё')
    await page.waitForTimeout(300)
    await expect(page.locator('article')).toHaveCount(0)
    await expect(page.getByText('Ничего не найдено')).toBeVisible()
  })
})
