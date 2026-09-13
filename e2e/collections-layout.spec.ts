import { epic, feature } from 'allure-js-commons'
import { expect, test } from './fixtures'

test.beforeEach(async () => {
  await epic('UI')
  await feature('Подборки — раскладка')
})

test('на телефоне тексты идут одной колонкой, номер над карточкой, десктопной сетки не видно', async ({ page, loginAsUser, createTestBook, createTestCollection }) => {
  const books = [await createTestBook(), await createTestBook()]
  const author = await loginAsUser()
  const collection = await createTestCollection({ authorUserId: author.userId, bookIds: books.map((book) => book.id) })

  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto(collection.url)

  const items = page.getByTestId('collection-item-mobile')
  await expect(items).toHaveCount(2)
  await expect(page.getByTestId('collection-item').first()).toBeHidden()

  const first = (await items.nth(0).boundingBox())!
  const second = (await items.nth(1).boundingBox())!
  // Одна колонка: одинаковый левый край, второй текст целиком ниже первого.
  expect(Math.abs(first.x - second.x)).toBeLessThan(1)
  expect(second.y).toBeGreaterThanOrEqual(first.y + first.height - 1)

  const number = (await items.nth(0).getByText('№ 01').boundingBox())!
  const card = (await items.nth(0).getByTestId('book-card-mobile').boundingBox())!
  expect(number.y + number.height).toBeLessThanOrEqual(card.y + 1)
})

test('на десктопе тексты идут сеткой в несколько колонок, мобильного списка не видно', async ({ page, loginAsUser, createTestBook, createTestCollection }) => {
  const books = [await createTestBook(), await createTestBook(), await createTestBook()]
  const author = await loginAsUser()
  const collection = await createTestCollection({ authorUserId: author.userId, bookIds: books.map((book) => book.id) })

  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto(collection.url)

  await expect(page.getByTestId('collection-item-mobile').first()).toBeHidden()
  const items = page.getByTestId('collection-item')
  const first = (await items.nth(0).boundingBox())!
  const second = (await items.nth(1).boundingBox())!
  // Колонка 760px и minmax(206px) дают три колонки: второй текст справа от первого на той же строке.
  expect(Math.abs(first.y - second.y)).toBeLessThan(1)
  expect(second.x).toBeGreaterThan(first.x + first.width - 1)
})
