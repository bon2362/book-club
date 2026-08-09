import type { APIRequestContext } from '@playwright/test'
import { test, expect } from '../../api-fixtures'

type BookState = {
  session: { stateVersion: number; status: string }
  bookMode: null | {
    viewerAssignmentBookIds: string[]
    books: Array<{ bookId: string; viewerStatus: string; formedAt: string | null }>
  }
}

async function state(request: APIRequestContext, sessionId: string, asUserId?: string): Promise<BookState> {
  const suffix = asUserId ? `&as=${asUserId}` : ''
  const response = await request.get(`/api/matching/state?session=${sessionId}${suffix}`)
  expect(response.ok(), await response.text()).toBe(true)
  return response.json() as Promise<BookState>
}

async function participantAction(
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

async function adminAction(
  request: APIRequestContext,
  sessionId: string,
  viewerUserId: string,
  action: 'closeSession' | 'reopenSession',
) {
  const current = await state(request, sessionId, viewerUserId)
  const response = await request.post(`/api/admin/matching/sessions/${sessionId}/book-admin-actions`, {
    data: { action, expectedStateVersion: current.session.stateVersion },
  })
  expect(response.ok(), await response.text()).toBe(true)
}

test('formed assignment guards shortlist removal and leaving the session', async ({ matchingApiFixture }) => {
  const { session, books, participantA, participantB, addParticipant } = matchingApiFixture
  const participantC = await addParticipant('Вера API E2E')

  await participantAction(participantB.request, session.id, 'setConditional', books[0].id)
  await participantAction(participantA.request, session.id, 'setHard', books[0].id)
  await participantAction(participantC.request, session.id, 'setHard', books[0].id)

  const assigned = await state(participantA.request, session.id)
  expect(assigned.bookMode?.viewerAssignmentBookIds).toContain(books[0].id)
  expect(assigned.bookMode?.books.find(book => book.bookId === books[0].id)?.formedAt).not.toBeNull()

  const removeBook = await participantA.request.delete(`/api/matching/books/${books[0].id}`)
  expect(removeBook.status()).toBe(409)
  expect(await removeBook.json()).toMatchObject({ error: 'participant_locked' })

  const leave = await participantA.request.delete(`/api/matching/sessions/${session.id}/leave`, {
    data: { expectedStateVersion: assigned.session.stateVersion },
  })
  expect(leave.status()).toBe(409)
  expect(await leave.json()).toMatchObject({ error: 'participant_locked' })
})

test('closed book session remains readable, rejects participant actions, and can reopen', async ({ matchingApiFixture }) => {
  const { session, books, participantA, participantB, admin } = matchingApiFixture
  await adminAction(admin.request, session.id, participantA.userId, 'closeSession')
  const closed = await state(participantB.request, session.id)
  expect(closed.session.status).toBe('closed')
  expect(closed.bookMode?.books.map(book => book.bookId)).toEqual(expect.arrayContaining(books.map(book => book.id)))

  const forbidden = await participantB.request.post(`/api/matching/sessions/${session.id}/book-actions`, {
    data: { action: 'setHard', bookId: books[0].id, expectedStateVersion: closed.session.stateVersion },
  })
  expect(forbidden.status()).toBe(409)

  const impersonation = await participantB.request.post(
    `/api/matching/sessions/${session.id}/book-actions?as=${participantA.userId}`,
    { data: { action: 'setHard', bookId: books[0].id, expectedStateVersion: closed.session.stateVersion } },
  )
  expect(impersonation.status()).toBe(403)

  await adminAction(admin.request, session.id, participantA.userId, 'reopenSession')
  const reopened = await state(participantB.request, session.id)
  expect(reopened.session.status).toBe('open')
})
