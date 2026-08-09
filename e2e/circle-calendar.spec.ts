import type { APIRequestContext, Page } from '@playwright/test'
import { epic, feature } from 'allure-js-commons'
import { test, expect } from './fixtures'

test.describe.configure({ timeout: 120_000 })

type BookModeState = {
  session: { stateVersion: number }
  bookMode: null | {
    viewerAssignmentBookIds: string[]
    books: Array<{
      bookId: string
      formedAt: string | null
      circles: Array<{ position: number; memberRefs: string[] }>
    }>
  }
}

async function state(request: APIRequestContext, sessionId: string): Promise<BookModeState> {
  const response = await request.get(`/api/matching/state?session=${sessionId}`)
  expect(response.ok(), await response.text()).toBe(true)
  return response.json() as Promise<BookModeState>
}

async function bookAction(
  request: APIRequestContext,
  sessionId: string,
  action: 'setConditional' | 'setHard',
  bookId: string,
) {
  const current = await state(request, sessionId)
  const response = await request.post(`/api/matching/sessions/${sessionId}/book-actions`, {
    data: { action, bookId, expectedStateVersion: current.session.stateVersion },
  })
  expect(response.ok(), await response.text()).toBe(true)
}

async function firstFutureCell(page: Page) {
  const key = await page.getByTestId('calendar-cell').evaluateAll((cells) => {
    const tomorrow = Date.now() + 24 * 60 * 60 * 1000
    const match = cells
      .map((cell) => cell.getAttribute('data-cell'))
      .filter((value): value is string => Boolean(value))
      .find((value) => new Date(value).getTime() > tomorrow)
    if (!match) throw new Error('future calendar cell not found')
    return match
  })
  return {
    key,
    locator: page.locator(`[data-testid="calendar-cell"][data-cell="${key}"]`),
  }
}

async function markSlot(request: APIRequestContext, key: string) {
  const startsAt = new Date(key)
  const endsAt = new Date(startsAt.getTime() + 60 * 60 * 1000)
  const response = await request.put('/api/calendar/availability', {
    data: { intervals: [{ startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() }] },
  })
  expect(response.ok(), await response.text()).toBe(true)
}

test.beforeEach(async () => {
  await epic('Календарь круга')
  await feature('Согласование времени')
})

test('участники отмечают общий слот и назначают встречу после reload', { tag: '@matching-golden' }, async ({
  matchingBooksFixture,
  openMatchingPage,
  dbExec,
}) => {
  const { session, books, participantA, getParticipantB, getParticipantC } = matchingBooksFixture
  const [participantB, participantC] = await Promise.all([getParticipantB(), getParticipantC()])
  const targetBook = books[0]

  try {
    await bookAction(participantA.request, session.id, 'setHard', targetBook.id)
    await bookAction(participantB.request, session.id, 'setHard', targetBook.id)
    await bookAction(participantC.request, session.id, 'setConditional', targetBook.id)

    const formed = await state(participantA.request, session.id)
    const formedBook = formed.bookMode?.books.find((book) => book.bookId === targetBook.id)
    expect(formedBook?.formedAt).not.toBeNull()
    expect(formedBook?.circles[0].position).toBe(1)

    const participantAPage = await openMatchingPage(participantA)
    await participantAPage.goto('/matching')
    const card = participantAPage.getByTestId(`matching-book-card-${targetBook.id}`)
    const calendarLink = card.getByRole('link', { name: 'Согласовать время' })
    await expect(calendarLink).toBeVisible()
    await calendarLink.click()
    await expect(participantAPage.getByTestId('calendar-grid')).toBeVisible()
    const calendarUrl = participantAPage.url()
    const slug = new URL(calendarUrl).pathname.split('/').pop()
    expect(slug).toBeTruthy()

    const { key } = await firstFutureCell(participantAPage)
    await markSlot(participantA.request, key)
    await markSlot(participantB.request, key)

    await participantAPage.reload()
    await expect(participantAPage.locator(`[data-testid="calendar-cell"][data-cell="${key}"]`)).toBeVisible()

    const scheduleResponse = await participantA.request.post(`/api/calendar/${slug}/meetings`, {
      data: { startsAt: key },
    })
    expect(scheduleResponse.ok(), await scheduleResponse.text()).toBe(true)

    await participantAPage.reload()
    await expect(participantAPage.getByRole('heading', { name: targetBook.title })).toBeVisible()
    await expect(participantAPage.getByText(`60 минут · ${targetBook.title}`)).toBeVisible()
  } finally {
    await dbExec('delete from circle_meetings where schedule_id in (select id from circle_schedules where book_id = $1)', [targetBook.id])
    await dbExec('delete from user_availability where user_id = any($1::text[])', [[participantA.userId, participantB.userId]])
    await dbExec('delete from circle_schedules where book_id = $1', [targetBook.id])
  }
})
