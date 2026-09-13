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

test('на широком десктопе (1440 px): четыре карточки в ряд шириной как в каталоге, одной высоты, описание в колонке 760 px', async ({ page, loginAsUser, createTestBook, createTestCollection }) => {
  const books = [
    await createTestBook(),
    // Длинное название делает одну карточку выше остальных — ряд должен выровняться по ней.
    await createTestBook({ title: `E2E очень длинное название книги, которое займёт в карточке несколько строк ${Date.now()}` }),
    await createTestBook(),
    await createTestBook(),
  ]
  const author = await loginAsUser()
  const collection = await createTestCollection({ authorUserId: author.userId, bookIds: books.map((book) => book.id) })

  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  const catalogCard = (await page.getByTestId('catalog-desktop').locator('article').first().boundingBox())!

  await page.goto(collection.url)
  await expect(page.getByTestId('collection-item-mobile').first()).toBeHidden()

  const items = page.getByTestId('collection-item')
  await expect(items).toHaveCount(4)
  const boxes = await Promise.all([0, 1, 2, 3].map(async (index) => (await items.nth(index).boundingBox())!))
  const buttons = await Promise.all(
    [0, 1, 2, 3].map(async (index) => (await items.nth(index).getByRole('button', { name: /хочу читать|в вашем списке/i }).boundingBox())!),
  )

  for (const box of boxes) {
    // Все четыре в одном ряду, ширина та же, что у карточки каталога, высота одинаковая.
    expect(Math.abs(box.y - boxes[0].y)).toBeLessThan(1)
    expect(Math.abs(box.width - catalogCard.width)).toBeLessThan(2)
    expect(Math.abs(box.height - boxes[0].height)).toBeLessThan(1)
  }
  for (const button of buttons) {
    expect(Math.abs(button.y - buttons[0].y)).toBeLessThan(1)
  }

  // Номер над карточкой — без собственной линии; единственная линия шапки — над подписью автора.
  const numberBorder = await items.nth(0).getByText('№ 01').evaluate((element) => getComputedStyle(element.parentElement!).borderTopWidth)
  expect(numberBorder).toBe('0px')
  const bylineBorder = await page.getByTestId('collection-byline').evaluate((element) => getComputedStyle(element).borderTopWidth)
  expect(bylineBorder).toBe('1px')

  const description = (await page.locator('.collection-description').boundingBox())!
  expect(description.width).toBeLessThanOrEqual(760)
})
