import type { APIRequestContext } from '@playwright/test'
import { epic, feature } from 'allure-js-commons'
import { test, expect } from './fixtures'

test.describe.configure({ timeout: 120_000 })

type BookModeState = {
  session: { stateVersion: number; status: string }
  bookMode: null | {
    viewerAssignmentBookIds: string[]
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

async function adminBookAction(
  request: APIRequestContext,
  sessionId: string,
  action: 'deleteCircle',
  payload: Record<string, string>,
) {
  const current = await state(request, sessionId)
  const response = await request.post(`/api/admin/matching/sessions/${sessionId}/book-admin-actions`, {
    data: { action, ...payload, expectedStateVersion: current.session.stateVersion },
  })
  expect(response.ok(), await response.text()).toBe(true)
}

test.beforeEach(async () => {
  await epic('Матчинг')
  await feature('Книжный режим')
})

test('условный выбор очищается после окончательной записи, а несколько твёрдых выборов сохраняются', { tag: '@matching-golden' }, async ({
  matchingBooksFixture,
  openMatchingPage,
}) => {
  const { session, books, participantA, getParticipantB, getParticipantC, addParticipant } = matchingBooksFixture
  const participantAPage = await openMatchingPage(participantA)
  await participantAPage.goto('/matching')

  const firstCard = participantAPage.getByTestId(`matching-book-card-${books[0].id}`)
  const secondCard = participantAPage.getByTestId(`matching-book-card-${books[1].id}`)
  const autoCaret = 'Автоматическая запись, если соберётся круг'
  const autoOption = 'Запишите меня автоматически, если соберётся круг'
  await firstCard.getByRole('button', { name: autoCaret }).click()
  const firstAutoOption = firstCard.getByRole('menuitemcheckbox', { name: autoOption })
  await firstAutoOption.click()
  await expect(firstAutoOption).toHaveAttribute('aria-checked', 'true')

  await participantAPage.reload()
  // The soft intent persists: the collapsed card advertises it, and reopening the menu shows it checked.
  await expect(firstCard.getByText('Авто-запись включена')).toBeVisible()
  await firstCard.getByRole('button', { name: autoCaret }).click()
  await expect(firstCard.getByRole('menuitemcheckbox', { name: autoOption })).toHaveAttribute('aria-checked', 'true')

  await secondCard.getByRole('button', { name: 'Записаться', exact: true }).click()
  await expect(secondCard).toContainText('✓ Вы записаны')
  await participantAPage.reload()
  await expect(secondCard).toContainText('✓ Вы записаны')
  // The hard choice atomically clears the soft auto-enroll: no active hint, no caret on the first card.
  await expect(firstCard.getByText('Авто-запись включена')).toHaveCount(0)
  await expect(firstCard.getByRole('button', { name: autoCaret })).toHaveCount(0)
  const afterHard = await state(participantA.request, session.id)
  expect(afterHard.bookMode?.books.find((book) => book.bookId === books[0].id)?.viewerStatus).toBe('interest')

  await firstCard.getByRole('button', { name: 'Записаться', exact: true }).click()
  await expect(firstCard).toContainText('✓ Вы записаны')
  await participantAPage.reload()
  await expect(firstCard).toContainText('✓ Вы записаны')

  const persisted = await state(participantA.request, session.id)
  expect(persisted.bookMode?.books.find((book) => book.bookId === books[0].id)?.viewerStatus).toBe('hard')
  expect(persisted.bookMode?.books.find((book) => book.bookId === books[1].id)?.viewerStatus).toBe('hard')

  const [participantB, participantC, participantD] = await Promise.all([
    getParticipantB(),
    getParticipantC(),
    addParticipant('Дарья Multibook Browser E2E'),
  ])
  await bookAction(participantC.request, session.id, 'setConditional', books[0].id)
  await bookAction(participantC.request, session.id, 'setConditional', books[1].id)
  await bookAction(participantD.request, session.id, 'setConditional', books[1].id)
  await bookAction(participantB.request, session.id, 'setHard', books[0].id)
  await bookAction(participantB.request, session.id, 'setHard', books[1].id)

  await participantAPage.reload()
  await expect(firstCard).toContainText('● Ваш круг')
  await expect(secondCard).toContainText('● Ваш круг')
  await expect(participantAPage.getByTestId('matching-books-selection')).toContainText(books[0].title)
  await expect(participantAPage.getByTestId('matching-books-selection')).toContainText(books[1].title)
  const formed = await state(participantA.request, session.id)
  expect(formed.bookMode?.viewerAssignmentBookIds).toEqual(expect.arrayContaining(books.map(book => book.id)))

  const participantCPage = await openMatchingPage(participantC)
  await participantCPage.goto('/matching')
  await expect(participantCPage.getByRole('status')).toContainText(`Авто-записи на «${books[1].title}» сняты`)
})

test('администратор добавляет твёрдый выбор просматриваемому участнику, а не себе', { tag: '@matching-golden' }, async ({
  matchingBooksFixture,
  openMatchingPage,
  dbExec,
}) => {
  const { session, books, participantA, admin } = matchingBooksFixture
  const participantAPage = await openMatchingPage(participantA)
  const adminPage = await openMatchingPage(admin)
  await bookAction(participantA.request, session.id, 'setHard', books[0].id)

  await adminPage.goto(`/matching?as=${participantA.userId}`)
  const firstCard = adminPage.getByTestId(`matching-book-card-${books[0].id}`)
  const secondCard = adminPage.getByTestId(`matching-book-card-${books[1].id}`)
  await expect(firstCard).toContainText('✓ Вы записаны')

  const actionResponse = adminPage.waitForResponse((response) => (
    response.request().method() === 'POST' &&
    response.url().includes(`/api/matching/sessions/${session.id}/book-actions?as=${participantA.userId}`)
  ))
  await secondCard.getByRole('button', { name: 'Записаться', exact: true }).click()
  expect((await actionResponse).ok()).toBe(true)

  await adminPage.reload()
  await expect(secondCard).toContainText('✓ Вы записаны')

  await participantAPage.goto('/matching')
  await participantAPage.reload()
  await expect(participantAPage.getByTestId(`matching-book-card-${books[1].id}`)).toContainText('✓ Вы записаны')
  const persisted = await state(participantA.request, session.id)
  expect(persisted.bookMode?.books.find((book) => book.bookId === books[1].id)?.viewerStatus).toBe('hard')
  expect(persisted.bookMode?.books.find((book) => book.bookId === books[0].id)?.viewerStatus).toBe('hard')

  const [event] = await dbExec(
    `select event_type, actor_user_id, subject_user_id, source, book_id
     from matching_events
     where session_id = $1 and event_type = 'hard_set' and book_id = $2
     order by occurred_at desc
     limit 1`,
    [session.id, books[1].id],
  )
  expect(event).toMatchObject({
    event_type: 'hard_set',
    actor_user_id: admin.userId,
    subject_user_id: participantA.userId,
    source: 'admin',
    book_id: books[1].id,
  })
})

test('два твёрдых выбора и одно условное формируют круг во всех независимых контекстах', { tag: '@matching-golden' }, async ({
  matchingBooksFixture,
  openMatchingPage,
}) => {
  const { session, books, participantA, getParticipantB, getParticipantC } = matchingBooksFixture
  const [participantB, participantC] = await Promise.all([getParticipantB(), getParticipantC()])
  const participantAPage = await openMatchingPage(participantA)
  const participantBPage = await openMatchingPage(participantB)
  const participantCPage = await openMatchingPage(participantC)
  await bookAction(participantB.request, session.id, 'setConditional', books[0].id)
  await bookAction(participantA.request, session.id, 'setHard', books[0].id)
  await bookAction(participantC.request, session.id, 'setHard', books[0].id)

  for (const [participant, page] of [
    [participantA, participantAPage],
    [participantB, participantBPage],
    [participantC, participantCPage],
  ] as const) {
    await page.goto('/matching')
    await page.reload()
    await expect(page.getByTestId('matching-books-selection')).toContainText(books[0].title)
    const persisted = await state(participant.request, session.id)
    expect(persisted.bookMode?.viewerAssignmentBookIds).toContain(books[0].id)
    const formed = persisted.bookMode?.books.find((book) => book.bookId === books[0].id)
    expect(formed?.formedAt).not.toBeNull()
    expect(formed?.circles).toHaveLength(1)
    expect(formed?.circles[0].memberRefs).toHaveLength(3)
  }

  const assignedState = await state(participantA.request, session.id)
  const removeAssignedBook = await participantA.request.delete(`/api/matching/books/${books[0].id}`)
  expect(removeAssignedBook.status()).toBe(409)
  const leave = await participantA.request.delete(`/api/matching/sessions/${session.id}/leave`, {
    data: { expectedStateVersion: assignedState.session.stateVersion },
  })
  expect(leave.status()).toBe(409)
  await participantAPage.reload()
  await expect(participantAPage.getByRole('button', { name: 'Отменить', exact: true })).toHaveCount(0)
  await participantAPage.reload()
  await expect(participantAPage.getByTestId('matching-books-selection')).toContainText(books[0].title)
})

test('актуальный шорт-лист меняется live: conditional снимается, hard защищён, свободный участник может выйти', { tag: '@matching-golden' }, async ({
  matchingBooksFixture,
  openMatchingPage,
  createTestBook,
}) => {
  const { session, participantA } = matchingBooksFixture
  const participantAPage = await openMatchingPage(participantA)
  const extraBook = await createTestBook({ title: `E2E Live shortlist ${test.info().testId}`, author: 'Live Author' })

  const add = await participantA.request.post('/api/matching/books', { data: { bookId: extraBook.id } })
  expect(add.ok(), await add.text()).toBe(true)
  await bookAction(participantA.request, session.id, 'setConditional', extraBook.id)

  const removeConditional = await participantA.request.delete(`/api/matching/books/${extraBook.id}`)
  expect(removeConditional.ok(), await removeConditional.text()).toBe(true)
  let current = await state(participantA.request, session.id)
  expect(current.bookMode?.books.some((book) => book.bookId === extraBook.id)).toBe(false)
  await participantAPage.goto('/matching')
  await participantAPage.reload()
  await expect(participantAPage.getByTestId(`matching-book-card-${extraBook.id}`)).toHaveCount(0)

  const addAgain = await participantA.request.post('/api/matching/books', { data: { bookId: extraBook.id } })
  expect(addAgain.ok(), await addAgain.text()).toBe(true)
  await bookAction(participantA.request, session.id, 'setHard', extraBook.id)
  const removeHard = await participantA.request.delete(`/api/matching/books/${extraBook.id}`)
  expect(removeHard.status()).toBe(409)
  await participantAPage.reload()
  await expect(participantAPage.getByTestId(`matching-book-card-${extraBook.id}`)).toContainText('✓ Вы записаны')

  await bookAction(participantA.request, session.id, 'cancelHard', extraBook.id)
  current = await state(participantA.request, session.id)
  const leave = await participantA.request.delete(`/api/matching/sessions/${session.id}/leave`, {
    data: { expectedStateVersion: current.session.stateVersion },
  })
  expect(leave.ok(), await leave.text()).toBe(true)
  await participantAPage.goto('/matching')
  await participantAPage.reload()
  await expect(participantAPage.getByTestId('welcome-join-button')).toBeVisible()
})

test('после cutover книга без ранга не возвращает участника на ranking gate', async ({
  matchingBooksFixture,
  openMatchingPage,
  dbExec,
}) => {
  const { books, participantA } = matchingBooksFixture
  const participantAPage = await openMatchingPage(participantA)
  await dbExec(
    'delete from book_priorities where user_id = $1 and book_id = $2',
    [participantA.userId, books[0].id],
  )

  await participantAPage.goto('/matching')
  await participantAPage.reload()
  await expect(participantAPage.getByTestId('matching-books-view')).toBeVisible()
  await expect(participantAPage.getByTestId('ranking-gate')).toHaveCount(0)
  await expect(participantAPage.getByTestId(`matching-book-card-${books[0].id}`)).toBeVisible()
})

test('диагностика состава видна администратору, но не участнику', async ({
  matchingBooksFixture,
  openMatchingPage,
}) => {
  const { session, books, participantA, getParticipantB, getParticipantC, admin } = matchingBooksFixture
  const [participantB, participantC] = await Promise.all([getParticipantB(), getParticipantC()])
  const targetBook = books[0]

  await bookAction(participantC.request, session.id, 'setConditional', targetBook.id)
  await bookAction(participantA.request, session.id, 'setHard', targetBook.id)
  await bookAction(participantB.request, session.id, 'setHard', targetBook.id)

  const formed = await state(participantA.request, session.id)
  const circle = formed.bookMode?.books.find((book) => book.bookId === targetBook.id)?.circles[0]
  expect(circle, 'книга должна сформировать круг').toBeTruthy()

  // Admin dissolves the circle: assignments survive but nobody is placed, which is exactly
  // the state both labels describe — and which only the organiser can repair.
  await adminBookAction(admin.request, session.id, 'deleteCircle', { circleId: circle!.id })

  const participantPage = await openMatchingPage(participantA)
  await participantPage.goto('/matching')
  const participantCard = participantPage.getByTestId(`matching-book-card-${targetBook.id}`)
  await expect(participantCard).toBeVisible()
  await expect(participantCard).not.toContainText('Состав требует корректировки')
  await expect(participantCard).not.toContainText('Без круга')

  const adminPage = await openMatchingPage(admin)
  await adminPage.goto('/matching')
  const adminCard = adminPage.getByTestId(`matching-book-card-${targetBook.id}`)
  await expect(adminCard).toContainText('Состав требует корректировки')
  await expect(adminCard).toContainText('Без круга')
})

test('администратор вне состава видит union книг и управление, но не participant CTA', async ({
  matchingBooksFixture,
  openMatchingPage,
}) => {
  const { books, admin } = matchingBooksFixture
  const adminPage = await openMatchingPage(admin)
  await adminPage.goto('/matching')
  await adminPage.reload()

  await expect(adminPage.getByTestId('matching-books-view')).toBeVisible()
  await expect(adminPage.getByTestId('matching-book-admin-toolbar')).toBeVisible()
  for (const book of books) {
    const card = adminPage.getByTestId(`matching-book-card-${book.id}`)
    await expect(card).not.toContainText('Административный режим — выбор участника недоступен')
    await expect(card.getByRole('button', { name: 'Записаться', exact: true })).toHaveCount(0)
    await expect(card.getByRole('button', { name: 'Автоматическая запись, если соберётся круг' })).toHaveCount(0)
    await expect(adminPage.getByTestId(`matching-book-admin-${book.id}`)).toBeVisible()
  }
})
