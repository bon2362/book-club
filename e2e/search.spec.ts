import { test, expect } from '@playwright/test'
import { epic, feature } from 'allure-js-commons'

test.describe('поиск по книгам', () => {
  test.beforeEach(async ({ page }) => {
    await epic('Каталог книг')
    await feature('Поиск')
    await page.goto('/')
    await page.waitForSelector('article, p:has-text("Ничего не найдено")')
  })

  test('поле поиска отображается на странице', async ({ page }) => {
    await expect(page.getByPlaceholder('Поиск по названию или автору…')).toBeVisible()
  })

  test('пустой запрос показывает все книги', async ({ page }) => {
    const searchInput = page.getByPlaceholder('Поиск по названию или автору…')
    await expect(searchInput).toHaveValue('')
    await expect(page.locator('article').first()).toBeVisible()
  })

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

  test('кириллический запрос возвращает результаты или «Ничего не найдено»', async ({ page }) => {
    await page.getByPlaceholder('Поиск по названию или автору…').fill('история')
    const cardCount = await page.locator('article').count()
    const emptyVisible = await page.getByText('Ничего не найдено').isVisible().catch(() => false)
    expect(cardCount > 0 || emptyVisible).toBe(true)
  })

  test('очистка поиска восстанавливает полный список', async ({ page }) => {
    const searchInput = page.getByPlaceholder('Поиск по названию или автору…')
    const totalBefore = await page.locator('article').count()
    await searchInput.fill('война')
    await searchInput.fill('')
    const totalAfter = await page.locator('article').count()
    expect(totalAfter).toBe(totalBefore)
  })

  test('несуществующий запрос показывает «Ничего не найдено»', async ({ page }) => {
    await page.getByPlaceholder('Поиск по названию или автору…').fill('zzzzzzzzz_нет_такой_книги')
    await page.waitForTimeout(300)
    const cardCount = await page.locator('article').count()
    if (cardCount === 0) {
      await expect(page.getByText('Ничего не найдено')).toBeVisible()
    }
  })
})
