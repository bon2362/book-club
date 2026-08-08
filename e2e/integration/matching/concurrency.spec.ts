import type { APIRequestContext } from '@playwright/test'
import { test, expect } from '../../api-fixtures'

type State = {
  session: { stateVersion: number }
  bookMode: {
    viewerAssignmentBookId: string | null
    books: Array<{ viewerStatus: string; formedAt: string | null }>
  }
}

async function state(request: APIRequestContext, sessionId: string): Promise<State> {
  const response = await request.get(`/api/matching/state?session=${sessionId}`)
  expect(response.ok(), await response.text()).toBe(true)
  return response.json() as Promise<State>
}

async function action(request: APIRequestContext, sessionId: string, actionName: 'setConditional' | 'setHard', bookId: string) {
  const current = await state(request, sessionId)
  const response = await request.post(`/api/matching/sessions/${sessionId}/book-actions`, {
    data: { action: actionName, bookId, expectedStateVersion: current.session.stateVersion },
  })
  expect(response.ok(), await response.text()).toBe(true)
}

test('concurrent thresholds assign a conditional participant exactly once', async ({ matchingApiFixture }) => {
  test.setTimeout(120_000)

  const { session, books, participantA, participantB, addParticipant } = matchingApiFixture
  const [participantC, participantD, participantE] = await Promise.all([
    addParticipant('Вера Книги E2E'),
    addParticipant('Глеб Книги E2E'),
    addParticipant('Дарья Книги E2E'),
  ])

  await action(participantB.request, session.id, 'setConditional', books[0].id)
  await action(participantB.request, session.id, 'setConditional', books[1].id)
  await action(participantA.request, session.id, 'setHard', books[0].id)
  await action(participantC.request, session.id, 'setHard', books[1].id)

  const hardWithStaleRetry = async (request: APIRequestContext, bookId: string) => {
    for (let attempt = 0; attempt < 3; attempt++) {
      const current = await state(request, session.id)
      const response = await request.post(`/api/matching/sessions/${session.id}/book-actions`, {
        data: { action: 'setHard', bookId, expectedStateVersion: current.session.stateVersion },
      })
      if (response.ok()) return
      if (response.status() !== 409 || attempt === 2) throw new Error(await response.text())
    }
  }
  await Promise.all([
    hardWithStaleRetry(participantD.request, books[0].id),
    hardWithStaleRetry(participantE.request, books[1].id),
  ])

  const result = await state(participantB.request, session.id)
  expect([books[0].id, books[1].id]).toContain(result.bookMode.viewerAssignmentBookId)
  expect(result.bookMode.books.filter(book => book.viewerStatus === 'assigned')).toHaveLength(1)
  expect(result.bookMode.books.filter(book => book.formedAt !== null)).toHaveLength(1)
})
