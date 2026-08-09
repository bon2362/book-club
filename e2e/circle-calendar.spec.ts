import type { APIRequestContext, Page, Response as PlaywrightResponse } from '@playwright/test'
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

async function markSlot(request: APIRequestContext, key: string, durationMinutes = 60) {
  const startsAt = new Date(key)
  const endsAt = new Date(startsAt.getTime() + durationMinutes * 60 * 1000)
  const response = await request.put('/api/calendar/availability', {
    data: { intervals: [{ startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() }] },
  })
  expect(response.ok(), await response.text()).toBe(true)
}

function addMinutes(key: string, minutes: number) {
  return new Date(new Date(key).getTime() + minutes * 60 * 1000).toISOString()
}

function waitForCalendarState(page: Page, slug: string) {
  return page.waitForResponse((response) =>
    response.url().includes(`/api/calendar/${slug}`) && response.request().method() === 'GET',
  )
}

function isAvailabilityPut(response: PlaywrightResponse) {
  return response.url().includes('/api/calendar/availability') && response.request().method() === 'PUT'
}

function isAvailabilityClear(response: PlaywrightResponse) {
  if (!isAvailabilityPut(response)) return false
  try {
    const body = response.request().postDataJSON() as { intervals?: unknown[] }
    return Array.isArray(body.intervals) && body.intervals.length === 0
  } catch {
    return false
  }
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
  const { session, books, participantA, admin, getParticipantB, getParticipantC } = matchingBooksFixture
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
    if (!slug) {
      throw new Error(`Calendar slug not found in URL: ${calendarUrl}`)
    }

    const durationResponse = await admin.request.patch(`/api/calendar/${slug}`, {
      data: { durationMinutes: 90 },
    })
    expect(durationResponse.ok(), await durationResponse.text()).toBe(true)

    const adminPage = await openMatchingPage(admin)
    await adminPage.goto(`${new URL(calendarUrl).pathname}?as=${participantA.userId}`)
    await expect(adminPage.getByTestId('calendar-grid')).toBeVisible()
    await expect(adminPage.getByLabel('Длительность встречи')).toHaveValue('90')

    const { key, locator } = await firstFutureCell(adminPage)
    const saveStatePromise = waitForCalendarState(adminPage, slug)
    const saveResponsePromise = adminPage.waitForResponse(isAvailabilityPut)
    await locator.click()
    await expect(adminPage.getByRole('dialog')).toHaveCount(0)
    const saveResponse = await saveResponsePromise
    expect(saveResponse.ok(), await saveResponse.text()).toBe(true)
    await saveStatePromise

    const eraseStatePromise = waitForCalendarState(adminPage, slug)
    const eraseResponsePromise = adminPage.waitForResponse(isAvailabilityClear)
    await adminPage.locator(`[data-testid="calendar-cell"][data-cell="${addMinutes(key, 60)}"]`).click()
    const eraseResponse = await eraseResponsePromise
    expect(eraseResponse.ok(), await eraseResponse.text()).toBe(true)
    await expect(eraseResponse.json()).resolves.toMatchObject({ intervals: [] })
    await eraseStatePromise

    const resaveStatePromise = waitForCalendarState(adminPage, slug)
    const resaveResponsePromise = adminPage.waitForResponse(isAvailabilityPut)
    await locator.click()
    const resaveResponse = await resaveResponsePromise
    expect(resaveResponse.ok(), await resaveResponse.text()).toBe(true)
    await resaveStatePromise

    await expect(adminPage.locator('[data-mine-marker="true"]')).toHaveCount(1)
    const participantBButton = adminPage.getByRole('button', { name: /Борис Книги E2E/i })
    await participantBButton.hover()
    await expect(adminPage.locator('[data-mine-marker="true"]')).toHaveCount(0)

    await markSlot(participantB.request, key, 90)

    await participantAPage.reload()
    await expect(participantAPage.locator(`[data-testid="calendar-cell"][data-cell="${key}"]`)).toBeVisible()

    const scheduleResponse = await admin.request.post(`/api/calendar/${slug}/meetings`, {
      data: { startsAt: key },
    })
    expect(scheduleResponse.ok(), await scheduleResponse.text()).toBe(true)

    await participantAPage.reload()
    await expect(participantAPage.getByRole('heading', { name: targetBook.title })).toBeVisible()
    await expect(participantAPage.getByText(`90 минут · ${targetBook.title}`)).toBeVisible()
  } finally {
    await dbExec('delete from circle_meetings where schedule_id in (select id from circle_schedules where book_id = $1)', [targetBook.id])
    await dbExec('delete from user_availability where user_id = any($1::text[])', [[participantA.userId, participantB.userId]])
    await dbExec('delete from circle_schedules where book_id = $1', [targetBook.id])
  }
})

test('админский режим показывает отметки всех участников круга', async ({
  matchingBooksFixture,
  openMatchingPage,
  dbExec,
}) => {
  const { session, books, participantA, admin, getParticipantB, getParticipantC } = matchingBooksFixture
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
    const calendarLink = participantAPage
      .getByTestId(`matching-book-card-${targetBook.id}`)
      .getByRole('link', { name: 'Согласовать время' })
    await calendarLink.click()
    await expect(participantAPage.getByTestId('calendar-grid')).toBeVisible()
    const calendarUrl = participantAPage.url()
    const slug = new URL(calendarUrl).pathname.split('/').pop()
    if (!slug) {
      throw new Error(`Calendar slug not found in URL: ${calendarUrl}`)
    }

    const { key } = await firstFutureCell(participantAPage)
    await markSlot(participantA.request, key, 90)

    const adminPage = await openMatchingPage(admin)
    await adminPage.goto(`${new URL(calendarUrl).pathname}?as=${participantB.userId}`)
    await expect(adminPage.getByTestId('calendar-grid')).toBeVisible()
    // Отметка участника A обязана быть видна, хотя действуем за участника B:
    // автоматический фокус на выбранном участнике прятал чужие отметки (#547),
    // и это откатили в #548. Тон проверяем по data-tone, а не по цвету: фон
    // задан через color-mix, и сравнение вычисленного значения хрупко.
    const foreignCell = adminPage.locator(`[data-testid="calendar-cell"][data-cell="${key}"]`)
    await expect(foreignCell).toHaveAttribute('data-tone', 'partial')
    await expect(foreignCell).toHaveAttribute('data-free', '1')
    // Свой уголок не рисуется: участник B это время не отмечал.
    await expect(adminPage.locator('[data-mine-marker="true"]')).toHaveCount(0)

  } finally {
    await dbExec('delete from user_availability where user_id = any($1::text[])', [[participantA.userId, participantB.userId]])
    await dbExec('delete from circle_schedules where book_id = $1', [targetBook.id])
  }
})
