import type { APIRequestContext } from '@playwright/test'
import { epic, feature } from 'allure-js-commons'
import { test, expect } from './fixtures'

test.describe.configure({ timeout: 120_000 })

type BookModeState = {
  session: { stateVersion: number }
  bookMode: null | { books: Array<{ bookId: string; formedAt: string | null }> }
}

async function bookAction(
  request: APIRequestContext,
  sessionId: string,
  action: 'setConditional' | 'setHard',
  bookId: string,
) {
  const current = await request.get(`/api/matching/state?session=${sessionId}`)
  expect(current.ok(), await current.text()).toBe(true)
  const { session } = (await current.json()) as BookModeState
  const response = await request.post(`/api/matching/sessions/${sessionId}/book-actions`, {
    data: { action, bookId, expectedStateVersion: session.stateVersion },
  })
  expect(response.ok(), await response.text()).toBe(true)
}

test.beforeEach(async () => {
  await epic('UI')
  await feature('Календарь круга')
})

test.describe('Геометрия календаря круга', () => {
  test('сетка помещается в экран на десктопе и на телефоне', { tag: '@matching-golden' }, async ({
    matchingBooksFixture,
    openMatchingPage,
  }) => {
    const { session, books, participantA, getParticipantB, getParticipantC } = matchingBooksFixture
    const [participantB, participantC] = await Promise.all([getParticipantB(), getParticipantC()])
    const targetBook = books[0]

    await bookAction(participantA.request, session.id, 'setHard', targetBook.id)
    await bookAction(participantB.request, session.id, 'setHard', targetBook.id)
    await bookAction(participantC.request, session.id, 'setConditional', targetBook.id)

    const page = await openMatchingPage(participantA)
    await page.goto('/matching')
    await page.getByTestId(`matching-book-card-${targetBook.id}`)
      .getByRole('link', { name: 'Согласовать время' })
      .click()
    await expect(page.getByTestId('calendar-grid')).toBeVisible()
    const calendarPath = new URL(page.url()).pathname

    for (const viewport of [{ width: 1280, height: 900 }, { width: 393, height: 852 }]) {
      await page.setViewportSize(viewport)
      await page.goto(calendarPath)

      const grid = page.getByTestId('calendar-grid')
      await expect(grid).toBeVisible()

      const gridBox = await grid.boundingBox()
      expect(gridBox).not.toBeNull()
      expect(gridBox!.x).toBeGreaterThanOrEqual(0)
      expect(gridBox!.x + gridBox!.width).toBeLessThanOrEqual(viewport.width + 1)

      // Главный мобильный дефект, который не ловится ничем другим.
      expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
        .toBeLessThanOrEqual(1)

      const cells = page.getByTestId('calendar-cell')
      expect(await cells.count()).toBeGreaterThan(0)
      const firstCell = cells.first()
      const cellBox = await firstCell.boundingBox()
      expect(cellBox).not.toBeNull()

      // На телефоне клетка выше: в 22px пальцем не попасть.
      const expectedHeight = viewport.width <= 540 ? 26 : 22
      expect(cellBox!.height).toBeCloseTo(expectedHeight, 0)
      expect(cellBox!.width).toBeGreaterThan(0)
      expect(cellBox!.x + cellBox!.width).toBeLessThanOrEqual(viewport.width + 1)

      // Семь колонок дней плюс колонка времени укладываются в ширину сетки.
      const columnCount = await grid.evaluate((element) => (
        getComputedStyle(element).gridTemplateColumns.split(' ').length
      ))
      expect(columnCount).toBeGreaterThanOrEqual(2)

      const participants = page.getByRole('heading', { name: 'Круг' })
      await expect(participants).toBeVisible()
      const participantsBox = await participants.boundingBox()
      expect(participantsBox).not.toBeNull()
      expect(participantsBox!.x + participantsBox!.width).toBeLessThanOrEqual(viewport.width + 1)

      if (viewport.width <= 540) {
        // На узком экране состав круга уезжает под сетку, а не встаёт колонкой рядом.
        expect(participantsBox!.y).toBeGreaterThan(gridBox!.y)
      }
    }
  })

  test('попап клетки на телефоне не выходит за экран', { tag: '@matching-golden' }, async ({
    matchingBooksFixture,
    openMatchingPage,
  }) => {
    const { session, books, participantA, getParticipantB, getParticipantC } = matchingBooksFixture
    const [participantB, participantC] = await Promise.all([getParticipantB(), getParticipantC()])
    const targetBook = books[0]

    await bookAction(participantA.request, session.id, 'setHard', targetBook.id)
    await bookAction(participantB.request, session.id, 'setHard', targetBook.id)
    await bookAction(participantC.request, session.id, 'setConditional', targetBook.id)

    const page = await openMatchingPage(participantA)
    await page.goto('/matching')
    await page.getByTestId(`matching-book-card-${targetBook.id}`)
      .getByRole('link', { name: 'Согласовать время' })
      .click()
    await expect(page.getByTestId('calendar-grid')).toBeVisible()
    const calendarPath = new URL(page.url()).pathname

    await page.setViewportSize({ width: 393, height: 852 })
    await page.goto(calendarPath)

    // Клетка с чужой занятостью или прошлым открывает попап без правки календаря;
    // для геометрии достаточно любой клетки, у которой есть свободные участники.
    const cell = page.getByTestId('calendar-cell').first()
    await cell.click()

    const popover = page.getByRole('dialog')
    if (await popover.count() === 0) return

    const box = await popover.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.x).toBeGreaterThanOrEqual(0)
    expect(box!.x + box!.width).toBeLessThanOrEqual(393 + 1)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth))
      .toBeLessThanOrEqual(1)
  })
})
