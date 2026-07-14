import type { APIRequestContext } from '@playwright/test'
import { epic, feature } from 'allure-js-commons'
import { test, expect } from './fixtures'

test.describe.configure({ timeout: 120_000 })

type BookModeState = {
  session: { stateVersion: number; status: string }
  bookMode: null | {
    viewerAssignmentBookId: string | null
    books: Array<{
      bookId: string
      viewerStatus: 'interest' | 'conditional' | 'hard' | 'assigned'
      formedAt: string | null
      circles: Array<{ id: string; memberRefs: string[] }>
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
  action: 'setConditional' | 'unsetConditional' | 'setHard' | 'cancelHard',
  bookId?: string,
) {
  const current = await state(request, sessionId)
  const response = await request.post(`/api/matching/sessions/${sessionId}/book-actions`, {
    data: { action, bookId, expectedStateVersion: current.session.stateVersion },
  })
  expect(response.ok(), await response.text()).toBe(true)
}

test.beforeEach(async () => {
  await epic('Матчинг')
  await feature('Книжный режим')
})

test('условный и твёрдый выбор сохраняются, а смена книги атомарно очищает остальные согласия', async ({
  matchingBooksFixture,
}) => {
  const { session, books, participantA } = matchingBooksFixture
  await participantA.page.goto('/matching')
  await participantA.page.waitForLoadState('networkidle')

  const firstCard = participantA.page.getByTestId(`matching-book-card-${books[0].id}`)
  const secondCard = participantA.page.getByTestId(`matching-book-card-${books[1].id}`)
  await firstCard.getByRole('button', { name: 'Готов читать', exact: true }).click()
  await expect(firstCard.getByRole('button', { name: /Готов читать/ })).toHaveAttribute('aria-pressed', 'true')

  await participantA.page.reload()
  await participantA.page.waitForLoadState('networkidle')
  await expect(firstCard.getByRole('button', { name: /Готов читать/ })).toHaveAttribute('aria-pressed', 'true')

  await secondCard.getByRole('button', { name: 'Записать', exact: true }).click()
  await expect(secondCard).toContainText('Вы записаны')
  await participantA.page.reload()
  await participantA.page.waitForLoadState('networkidle')
  await expect(secondCard).toContainText('Вы записаны')
  await expect(firstCard.getByRole('button', { name: /Готов читать/ })).toHaveCount(0)
  const afterHard = await state(participantA.page.request, session.id)
  expect(afterHard.bookMode?.books.find((book) => book.bookId === books[0].id)?.viewerStatus).toBe('interest')

  await firstCard.getByRole('button', { name: 'Записаться сюда', exact: true }).click()
  await expect(firstCard).toContainText('Вы записаны')
  await participantA.page.reload()
  await participantA.page.waitForLoadState('networkidle')
  await expect(firstCard).toContainText('Вы записаны')
  await expect(secondCard).not.toContainText('Вы записаны')

  const persisted = await state(participantA.page.request, session.id)
  expect(persisted.bookMode?.books.find((book) => book.bookId === books[0].id)?.viewerStatus).toBe('hard')
  expect(persisted.bookMode?.books.find((book) => book.bookId === books[1].id)?.viewerStatus).toBe('interest')
})

test('администратор переключает твёрдый выбор просматриваемого участника, а не свой', async ({
  matchingBooksFixture,
  dbExec,
}) => {
  const { session, books, participantA, admin } = matchingBooksFixture
  await bookAction(participantA.page.request, session.id, 'setHard', books[0].id)

  await admin.page.goto(`/matching?as=${participantA.userId}`)
  await admin.page.waitForLoadState('networkidle')
  const firstCard = admin.page.getByTestId(`matching-book-card-${books[0].id}`)
  const secondCard = admin.page.getByTestId(`matching-book-card-${books[1].id}`)
  await expect(firstCard).toContainText('Вы записаны')

  const switchResponse = admin.page.waitForResponse((response) => (
    response.request().method() === 'POST' &&
    response.url().includes(`/api/matching/sessions/${session.id}/book-actions?as=${participantA.userId}`)
  ))
  await secondCard.getByRole('button', { name: 'Записаться сюда', exact: true }).click()
  expect((await switchResponse).ok()).toBe(true)

  await admin.page.reload()
  await admin.page.waitForLoadState('networkidle')
  await expect(secondCard).toContainText('Вы записаны')
  await expect(firstCard).not.toContainText('Вы записаны')

  await participantA.page.goto('/matching')
  await participantA.page.reload()
  await participantA.page.waitForLoadState('networkidle')
  await expect(participantA.page.getByTestId(`matching-book-card-${books[1].id}`)).toContainText('Вы записаны')
  const persisted = await state(participantA.page.request, session.id)
  expect(persisted.bookMode?.books.find((book) => book.bookId === books[1].id)?.viewerStatus).toBe('hard')

  const [event] = await dbExec(
    `select event_type, actor_user_id, subject_user_id, source, book_id
     from matching_events
     where session_id = $1 and event_type = 'hard_switched'
     order by occurred_at desc
     limit 1`,
    [session.id],
  )
  expect(event).toMatchObject({
    event_type: 'hard_switched',
    actor_user_id: admin.userId,
    subject_user_id: participantA.userId,
    source: 'admin',
    book_id: books[1].id,
  })
})

test('два твёрдых выбора и одно условное формируют круг во всех независимых контекстах', async ({
  matchingBooksFixture,
}) => {
  const { session, books, participantA, participantB, participantC } = matchingBooksFixture
  await bookAction(participantB.page.request, session.id, 'setConditional', books[0].id)
  await bookAction(participantA.page.request, session.id, 'setHard', books[0].id)
  await bookAction(participantC.page.request, session.id, 'setHard', books[0].id)

  for (const participant of [participantA, participantB, participantC]) {
    await participant.page.goto('/matching')
    await participant.page.reload()
    await participant.page.waitForLoadState('networkidle')
    const card = participant.page.getByTestId(`matching-book-card-${books[0].id}`)
    await expect(card).toContainText('Вы назначены на эту книгу')
    const persisted = await state(participant.page.request, session.id)
    expect(persisted.bookMode?.viewerAssignmentBookId).toBe(books[0].id)
    const formed = persisted.bookMode?.books.find((book) => book.bookId === books[0].id)
    expect(formed?.formedAt).not.toBeNull()
    expect(formed?.circles).toHaveLength(1)
    expect(formed?.circles[0].memberRefs).toHaveLength(3)
  }

  const assignedState = await state(participantA.page.request, session.id)
  const removeAssignedBook = await participantA.page.request.delete(`/api/matching/books/${books[0].id}`)
  expect(removeAssignedBook.status()).toBe(409)
  const leave = await participantA.page.request.delete(`/api/matching/sessions/${session.id}/leave`, {
    data: { expectedStateVersion: assignedState.session.stateVersion },
  })
  expect(leave.status()).toBe(409)
  await participantA.page.reload()
  await expect(participantA.page.getByTestId(`matching-book-card-${books[0].id}`)).toContainText('Вы назначены на эту книгу')
})

test('актуальный шорт-лист меняется live: conditional снимается, hard защищён, свободный участник может выйти', async ({
  matchingBooksFixture,
  createTestBook,
}) => {
  const { session, participantA } = matchingBooksFixture
  const extraBook = await createTestBook({ title: `E2E Live shortlist ${test.info().testId}`, author: 'Live Author' })

  const add = await participantA.page.request.post('/api/matching/books', { data: { bookId: extraBook.id } })
  expect(add.ok(), await add.text()).toBe(true)
  await bookAction(participantA.page.request, session.id, 'setConditional', extraBook.id)

  const removeConditional = await participantA.page.request.delete(`/api/matching/books/${extraBook.id}`)
  expect(removeConditional.ok(), await removeConditional.text()).toBe(true)
  let current = await state(participantA.page.request, session.id)
  expect(current.bookMode?.books.some((book) => book.bookId === extraBook.id)).toBe(false)
  await participantA.page.goto('/matching')
  await participantA.page.reload()
  await expect(participantA.page.getByTestId(`matching-book-card-${extraBook.id}`)).toHaveCount(0)

  const addAgain = await participantA.page.request.post('/api/matching/books', { data: { bookId: extraBook.id } })
  expect(addAgain.ok(), await addAgain.text()).toBe(true)
  await bookAction(participantA.page.request, session.id, 'setHard', extraBook.id)
  const removeHard = await participantA.page.request.delete(`/api/matching/books/${extraBook.id}`)
  expect(removeHard.status()).toBe(409)
  await participantA.page.reload()
  await expect(participantA.page.getByTestId(`matching-book-card-${extraBook.id}`)).toContainText('Вы записаны')

  await bookAction(participantA.page.request, session.id, 'cancelHard')
  current = await state(participantA.page.request, session.id)
  const leave = await participantA.page.request.delete(`/api/matching/sessions/${session.id}/leave`, {
    data: { expectedStateVersion: current.session.stateVersion },
  })
  expect(leave.ok(), await leave.text()).toBe(true)
  await participantA.page.goto('/matching')
  await participantA.page.reload()
  await expect(participantA.page.getByTestId('welcome-join-button')).toBeVisible()
})

test('при одновременном достижении порога на двух книгах условный участник получает ровно одно назначение', async ({
  matchingBooksFixture,
}) => {
  const { session, books, participantA, participantB, participantC, addParticipant } = matchingBooksFixture
  const participantD = await addParticipant('Глеб Книги E2E')
  const participantE = await addParticipant('Дарья Книги E2E')

  await bookAction(participantB.page.request, session.id, 'setConditional', books[0].id)
  await bookAction(participantB.page.request, session.id, 'setConditional', books[1].id)
  await bookAction(participantA.page.request, session.id, 'setHard', books[0].id)
  await bookAction(participantC.page.request, session.id, 'setHard', books[1].id)

  async function hardWithStaleRetry(request: APIRequestContext, bookId: string) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const current = await state(request, session.id)
      const response = await request.post(`/api/matching/sessions/${session.id}/book-actions`, {
        data: { action: 'setHard', bookId, expectedStateVersion: current.session.stateVersion },
      })
      if (response.ok()) return
      if (response.status() !== 409 || attempt === 2) {
        throw new Error(`concurrent setHard failed: ${response.status()} ${await response.text()}`)
      }
    }
  }

  await Promise.all([
    hardWithStaleRetry(participantD.page.request, books[0].id),
    hardWithStaleRetry(participantE.page.request, books[1].id),
  ])

  const result = await state(participantB.page.request, session.id)
  expect([books[0].id, books[1].id]).toContain(result.bookMode?.viewerAssignmentBookId)
  expect(result.bookMode?.books.filter((book) => book.viewerStatus === 'assigned')).toHaveLength(1)
  expect(result.bookMode?.books.filter((book) => book.formedAt !== null)).toHaveLength(1)
})

test('после cutover книга без ранга не возвращает участника на ranking gate', async ({
  matchingBooksFixture,
  dbExec,
}) => {
  const { books, participantA } = matchingBooksFixture
  await dbExec(
    'delete from book_priorities where user_id = $1 and book_id = $2',
    [participantA.userId, books[0].id],
  )

  await participantA.page.goto('/matching')
  await participantA.page.reload()
  await participantA.page.waitForLoadState('networkidle')
  await expect(participantA.page.getByTestId('matching-books-view')).toBeVisible()
  await expect(participantA.page.getByTestId('ranking-gate')).toHaveCount(0)
  await expect(participantA.page.getByTestId(`matching-book-card-${books[0].id}`)).toBeVisible()
})

test('администратор вне состава видит union книг и управление, но не participant CTA', async ({
  matchingBooksFixture,
}) => {
  const { books, admin } = matchingBooksFixture
  await admin.page.goto('/matching')
  await admin.page.reload()
  await admin.page.waitForLoadState('networkidle')

  await expect(admin.page.getByTestId('matching-books-view')).toBeVisible()
  await expect(admin.page.getByTestId('matching-book-admin-toolbar')).toBeVisible()
  for (const book of books) {
    const card = admin.page.getByTestId(`matching-book-card-${book.id}`)
    await expect(card).not.toContainText('Административный режим — выбор участника недоступен')
    await expect(card.getByRole('button', { name: 'Записать', exact: true })).toHaveCount(0)
    await expect(card.getByRole('button', { name: /Готов читать/ })).toHaveCount(0)
    await expect(admin.page.getByTestId(`matching-book-admin-${book.id}`)).toBeVisible()
  }
})
