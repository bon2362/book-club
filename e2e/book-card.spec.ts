import { test, expect } from './fixtures'
import { epic, feature } from 'allure-js-commons'

// BookCard показывает кнопку «Читать далее» только когда description.length > 120.
// Клик разворачивает описание и меняет кнопку на «Свернуть».
// Клик на «Свернуть» сворачивает обратно.

test.describe('карточка книги — разворачивание описания', () => {
  test.beforeEach(async ({ page }) => {
    await epic('Каталог книг')
    await feature('Карточка книги')
    await page.goto('/')
    await page.waitForSelector('article')
  })

  // Roundtrip: «Читать далее» присутствует → клик разворачивает («Свернуть»)
  // → клик сворачивает обратно. Покрывает прежние 3 теста одним сценарием.
  test('разворачивание и сворачивание описания (roundtrip)', async ({ page }) => {
    const readMore = page.getByRole('button', { name: /читать далее/i }).first()
    await expect(readMore).toBeVisible()

    await readMore.click()
    await expect(page.getByRole('button', { name: /свернуть/i }).first()).toBeVisible()

    await page.getByRole('button', { name: /свернуть/i }).first().click()
    await expect(page.getByRole('button', { name: /читать далее/i }).first()).toBeVisible()
  })
})
