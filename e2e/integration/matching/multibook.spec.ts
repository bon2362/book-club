import type { APIRequestContext } from '@playwright/test'
import { test, expect } from '../../api-fixtures'

type State = {
  session: { stateVersion: number }
  notices: Array<{ kind: string; payload: { books?: string[] } }>
  bookMode: {
    viewerAssignmentBookIds: string[]
    books: Array<{ bookId: string; viewerStatus: string; formedAt: string | null }>
  }
}

async function state(request: APIRequestContext, sessionId: string): Promise<State> {
  const response = await request.get(`/api/matching/state?session=${sessionId}`)
  expect(response.ok(), await response.text()).toBe(true)
  return response.json() as Promise<State>
}

async function action(
  request: APIRequestContext,
  sessionId: string,
  actionName: 'setConditional' | 'setHard',
  bookId: string,
) {
  const current = await state(request, sessionId)
  const response = await request.post(`/api/matching/sessions/${sessionId}/book-actions`, {
    data: { action: actionName, bookId, expectedStateVersion: current.session.stateVersion },
  })
  expect(response.ok(), await response.text()).toBe(true)
}

async function adminAssign(
  request: APIRequestContext,
  sessionId: string,
  userId: string,
  bookId: string,
) {
  const current = await state(request, sessionId)
  const response = await request.post(`/api/admin/matching/sessions/${sessionId}/book-admin-actions`, {
    data: { action: 'assign', userId, bookId, expectedStateVersion: current.session.stateVersion },
  })
  expect(response.ok(), await response.text()).toBe(true)
}

test('one participant is assigned to two formed books and assignment clears remaining auto-enrolments', async ({
  matchingApiFixture,
  createTestBook,
}) => {
  test.setTimeout(120_000)
  const { session, books, participantA, participantB, admin, addParticipant } = matchingApiFixture
  const extraBook = await createTestBook({ title: `API Matching auto cleanup ${test.info().testId}` })
  const [participantC, participantD, participantE, participantF, participantG] = await Promise.all([
    addParticipant('Вера Multibook E2E'),
    addParticipant('Глеб Multibook E2E'),
    addParticipant('Дарья Multibook E2E'),
    addParticipant('Ирина Multibook E2E', [...books, extraBook]),
    addParticipant('Лев Multibook E2E', [...books, extraBook]),
  ])

  await action(participantA.request, session.id, 'setHard', books[0].id)
  await action(participantA.request, session.id, 'setHard', books[1].id)
  await action(participantB.request, session.id, 'setHard', books[0].id)
  await action(participantC.request, session.id, 'setConditional', books[1].id)
  await action(participantC.request, session.id, 'setConditional', books[0].id)
  await action(participantE.request, session.id, 'setConditional', books[1].id)
  await action(participantD.request, session.id, 'setHard', books[1].id)

  const participantAState = await state(participantA.request, session.id)
  expect(participantAState.bookMode.viewerAssignmentBookIds).toEqual(
    expect.arrayContaining(books.map(book => book.id)),
  )
  expect(participantAState.bookMode.books.filter(book => book.viewerStatus === 'assigned')).toHaveLength(2)
  expect(participantAState.bookMode.books.filter(book => book.formedAt !== null)).toHaveLength(2)

  const participantCState = await state(participantC.request, session.id)
  expect(participantCState.notices).toContainEqual(expect.objectContaining({
    kind: 'conditional_intents_cleared',
    payload: { books: [books[1].title] },
  }))
  expect(participantCState.bookMode.books.find(book => book.bookId === books[1].id)?.viewerStatus)
    .toBe('interest')

  await action(participantF.request, session.id, 'setConditional', extraBook.id)
  await action(participantF.request, session.id, 'setHard', books[1].id)
  const participantFState = await state(participantF.request, session.id)
  expect(participantFState.bookMode.viewerAssignmentBookIds).toContain(books[1].id)
  expect(participantFState.notices).toContainEqual(expect.objectContaining({
    kind: 'conditional_intents_cleared',
    payload: { books: [extraBook.title] },
  }))

  await action(participantG.request, session.id, 'setConditional', extraBook.id)
  await adminAssign(admin.request, session.id, participantG.userId, books[1].id)
  const participantGState = await state(participantG.request, session.id)
  expect(participantGState.bookMode.viewerAssignmentBookIds).toContain(books[1].id)
  expect(participantGState.notices).toContainEqual(expect.objectContaining({
    kind: 'conditional_intents_cleared',
    payload: { books: [extraBook.title] },
  }))

})
