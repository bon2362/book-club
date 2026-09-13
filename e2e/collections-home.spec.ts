import { epic, feature } from 'allure-js-commons'
import { expect, test } from './fixtures'

test.beforeEach(async () => {
  await epic('Подборки')
  await feature('Блок на главной')
})

test('выключенный блок не показывается, включённый — показывается после перезагрузки', async ({ page, loginAsUser, loginAsAdmin, createTestBook, createTestCollection, setHomeCollectionsBlock }) => {
  const books = [await createTestBook(), await createTestBook()]
  const author = await loginAsUser()
  const collection = await createTestCollection({ authorUserId: author.userId, bookIds: books.map(book => book.id) })
  await setHomeCollectionsBlock(false)

  await page.goto('/')
  await expect(page.getByTestId('home-collections')).toHaveCount(0)

  await loginAsAdmin()
  await page.goto('/admin?tab=collections')
  const toggle = page.getByRole('button', { name: /Блок подборок на главной/ })
  await expect(toggle).toHaveAttribute('aria-pressed', 'false', { timeout: 15_000 })
  await Promise.all([
    page.waitForResponse(response => response.url().includes('/api/admin/collections/settings') && response.request().method() === 'PATCH'),
    toggle.click(),
  ])

  await page.goto('/')
  await page.reload()
  const block = page.getByTestId('home-collections')
  await expect(block).toBeVisible()
  await expect(block).toContainText(collection.title)
})

test('карусель: около 3,35 карточки на десктопе, 82% на телефоне, стрелки у краёв', async ({ page, loginAsUser, createTestBook, createTestCollection, setHomeCollectionsBlock }) => {
  const author = await loginAsUser()
  for (let index = 0; index < 5; index++) {
    const books = [await createTestBook(), await createTestBook()]
    await createTestCollection({ authorUserId: author.userId, bookIds: books.map(book => book.id) })
  }
  await setHomeCollectionsBlock(true)

  await page.setViewportSize({ width: 1280, height: 900 })
  await page.goto('/')
  const carousel = page.getByTestId('collections-carousel')
  const track = (await carousel.boundingBox())!
  const card = (await carousel.locator('.collections-carousel-item').first().boundingBox())!
  expect(Math.abs(card.width - (track.width - 60) / 3.35)).toBeLessThan(2)
  await expect(page.getByRole('button', { name: 'Назад' })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Вперёд' })).toBeVisible()

  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload()
  const mobileTrack = (await page.getByTestId('collections-carousel').boundingBox())!
  const mobileCard = (await page.locator('.collections-carousel-item').first().boundingBox())!
  expect(Math.abs(mobileCard.width - mobileTrack.width * 0.82)).toBeLessThan(2)
})
