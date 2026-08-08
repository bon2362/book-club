import { test, expect } from './fixtures'
import { epic, feature } from 'allure-js-commons'

test.beforeEach(async () => {
  await epic('UI')
  await feature('Matching')
})

test.describe('Matching canonical book board layout', () => {
  test('one book board without mode tabs fits desktop and mobile', { tag: '@matching-golden' }, async ({
    matchingBooksFixture,
    openMatchingPage,
  }) => {
    const { books, participantA } = matchingBooksFixture
    const page = await openMatchingPage(participantA)

    for (const viewport of [{ width: 1280, height: 900 }, { width: 393, height: 852 }]) {
      await page.setViewportSize(viewport)
      await page.goto('/matching')

      const board = page.getByTestId('matching-books-view')
      const card = page.getByTestId(`matching-book-card-${books[0].id}`)
      await expect(board).toBeVisible()
      await expect(page.getByRole('tab')).toHaveCount(0)
      await expect(page.getByText('Сценарии', { exact: true })).toHaveCount(0)
      await expect(page.getByTestId('matching-header').getByText(/Группы? (по )?\d/)).toHaveCount(0)

      const [boardBox, cardBox] = await Promise.all([board.boundingBox(), card.boundingBox()])
      expect(boardBox).not.toBeNull()
      expect(cardBox).not.toBeNull()
      expect(cardBox!.x).toBeGreaterThanOrEqual(0)
      expect(cardBox!.x + cardBox!.width).toBeLessThanOrEqual(viewport.width + 1)
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1)

      const cover = card.getByRole('button', { name: `Открыть книгу «${books[0].title}»` })
      const coverBox = await cover.boundingBox()
      expect(coverBox).not.toBeNull()
      expect(await cover.evaluate((element) => getComputedStyle(element).position)).toBe('relative')
      if (viewport.width <= 540) {
        expect(coverBox!.width).toBeCloseTo(56, 0)
        expect(coverBox!.height).toBeCloseTo(80, 0)
      }
    }
  })

  test('mobile book sheet stays in the viewport and restores focus', async ({
    matchingBooksFixture,
    openMatchingPage,
  }) => {
    const { books, participantA } = matchingBooksFixture
    const page = await openMatchingPage(participantA)
    await page.setViewportSize({ width: 393, height: 852 })
    await page.goto('/matching')

    const trigger = page.getByRole('button', { name: `Открыть книгу «${books[0].title}»` })
    await trigger.focus()
    await trigger.click()
    const dialog = page.getByRole('dialog', { name: books[0].title })
    await expect(dialog).toBeVisible()

    const dialogBox = await dialog.boundingBox()
    expect(dialogBox).not.toBeNull()
    expect(dialogBox!.x).toBeGreaterThanOrEqual(0)
    expect(dialogBox!.x + dialogBox!.width).toBeLessThanOrEqual(394)
    await expect.poll(async () => {
      const settledBox = await dialog.boundingBox()
      return settledBox ? settledBox.y + settledBox.height : Number.POSITIVE_INFINITY
    }).toBeLessThanOrEqual(853)

    await page.keyboard.press('Escape')
    await expect(dialog).toHaveCount(0)
    await expect(trigger).toBeFocused()
  })

  test('auto-enroll menu stays below the record button on desktop and mobile', async ({
    matchingBooksFixture,
    openMatchingPage,
  }) => {
    const { books, participantA } = matchingBooksFixture
    const page = await openMatchingPage(participantA)

    for (const viewport of [{ width: 1280, height: 900 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport)
      await page.goto('/matching')
      const card = page.getByTestId(`matching-book-card-${books[0].id}`)
      const caret = card.getByRole('button', { name: 'Автоматическая запись, если соберётся круг' })
      await caret.click()

      const menu = card.locator('.nd-mb-split-menu')
      await expect(menu).toBeVisible()
      const [menuBox, barBox] = await Promise.all([
        menu.boundingBox(),
        card.locator('.nd-mb-split-bar').boundingBox(),
      ])
      expect(menuBox).not.toBeNull()
      expect(barBox).not.toBeNull()
      expect(menuBox!.x).toBeGreaterThanOrEqual(0)
      expect(menuBox!.x + menuBox!.width).toBeLessThanOrEqual(viewport.width + 1)
      expect(menuBox!.y).toBeGreaterThanOrEqual(barBox!.y + barBox!.height - 1)

      await page.keyboard.press('Escape')
      await expect(menu).toHaveCount(0)
      await expect(caret).toBeFocused()
    }
  })
})
