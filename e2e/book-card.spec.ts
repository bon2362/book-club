import { test, expect } from '@playwright/test'

// BookCard показывает кнопку «Читать далее» только когда description.length > 120.
// Клик разворачивает описание и меняет кнопку на «Свернуть».
// Клик на «Свернуть» сворачивает обратно.

test.describe('карточка книги — разворачивание описания', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('article')
  })

  test('кнопка «Читать далее» присутствует хотя бы на одной карточке', async ({ page }) => {
    await expect(page.getByRole('button', { name: /читать далее/i }).first()).toBeVisible()
  })

  test('клик на «Читать далее» показывает «Свернуть»', async ({ page }) => {
    await page.getByRole('button', { name: /читать далее/i }).first().click()
    await expect(page.getByRole('button', { name: /свернуть/i }).first()).toBeVisible()
  })

  test('клик на «Свернуть» возвращает кнопку «Читать далее»', async ({ page }) => {
    await page.getByRole('button', { name: /читать далее/i }).first().click()
    await page.getByRole('button', { name: /свернуть/i }).first().click()
    await expect(page.getByRole('button', { name: /читать далее/i }).first()).toBeVisible()
  })
})
