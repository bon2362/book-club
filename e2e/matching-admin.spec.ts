import type { APIRequestContext } from '@playwright/test'
import { epic, feature } from 'allure-js-commons'
import { test, expect } from './fixtures'

test.describe.configure({ timeout: 120_000 })

type PublicState = {
  session: { stateVersion: number; status: 'open' | 'closed' }
  bookMode: {
    books: Array<{ bookId: string; circles: Array<{ id: string }> }>
  }
}

async function getState(request: APIRequestContext, sessionId: string): Promise<PublicState> {
  const response = await request.get(`/api/matching/state?session=${sessionId}`)
  expect(response.ok(), await response.text()).toBe(true)
  return response.json() as Promise<PublicState>
}

async function participantAction(
  request: APIRequestContext,
  sessionId: string,
  bookId: string,
  action: 'setConditional' | 'setHard',
) {
  const current = await getState(request, sessionId)
  const response = await request.post(`/api/matching/sessions/${sessionId}/book-actions`, {
    data: { action, bookId, expectedStateVersion: current.session.stateVersion },
  })
  expect(response.ok(), await response.text()).toBe(true)
}

async function adminAction(
  request: APIRequestContext,
  sessionId: string,
  viewerUserId: string,
  data: Record<string, unknown>,
) {
  const currentResponse = await request.get(`/api/matching/state?session=${sessionId}&as=${viewerUserId}`)
  expect(currentResponse.ok(), await currentResponse.text()).toBe(true)
  const current = await currentResponse.json() as PublicState
  const response = await request.post(`/api/admin/matching/sessions/${sessionId}/book-admin-actions`, {
    data: { ...data, expectedStateVersion: current.session.stateVersion },
  })
  expect(response.ok(), await response.text()).toBe(true)
}

test.beforeEach(async () => {
  await epic('Матчинг')
  await feature('Администрирование книжных кругов')
})

test('администратор меняет круги, назначения и lifecycle с сохранением после reload', { tag: '@matching-golden' }, async ({
  matchingBooksFixture,
  openMatchingPage,
}) => {
  const { session, books, participantA, admin, getParticipantB, getParticipantC } = matchingBooksFixture
  const [participantB, participantC] = await Promise.all([getParticipantB(), getParticipantC()])
  const [participantAPage, participantBPage, participantCPage] = await Promise.all([
    openMatchingPage(participantA),
    openMatchingPage(participantB),
    openMatchingPage(participantC),
  ])

  await participantAction(participantB.request, session.id, books[0].id, 'setConditional')
  await participantAction(participantA.request, session.id, books[0].id, 'setHard')
  await participantAction(participantC.request, session.id, books[0].id, 'setHard')

  const formed = await getState(admin.request, session.id)
  const originalCircle = formed.bookMode.books.find((book) => book.bookId === books[0].id)?.circles[0]
  expect(originalCircle).toBeTruthy()
  await adminAction(admin.request, session.id, participantA.userId, {
    action: 'deleteCircle', circleId: originalCircle!.id,
  })
  await participantAPage.goto('/matching')
  await participantAPage.reload()
  await expect(participantAPage.getByTestId(`matching-book-card-${books[0].id}`)).toContainText('Без круга')

  await adminAction(admin.request, session.id, participantA.userId, {
    action: 'createCircle', bookId: books[0].id,
  })
  const recreated = await getState(admin.request, session.id)
  const replacementCircle = recreated.bookMode.books.find((book) => book.bookId === books[0].id)?.circles[0]
  expect(replacementCircle).toBeTruthy()
  await adminAction(admin.request, session.id, participantA.userId, {
    action: 'place', userId: participantA.userId, bookId: books[0].id, circleId: replacementCircle!.id,
  })
  await participantAPage.reload()
  await expect(participantAPage.getByTestId(`matching-book-card-${books[0].id}`).getByRole('region', { name: 'Круг 1' }))
    .toContainText('Вы')

  await adminAction(admin.request, session.id, participantA.userId, {
    action: 'assign', userId: participantC.userId, bookId: books[1].id,
  })
  await participantCPage.goto('/matching')
  await participantCPage.reload()
  await expect(participantCPage.getByTestId('matching-books-selection')).toContainText(books[1].title)

  await adminAction(admin.request, session.id, participantA.userId, {
    action: 'unassign', userId: participantB.userId, bookId: books[0].id,
  })
  await participantBPage.goto('/matching')
  await participantBPage.reload()
  await expect(participantBPage.getByTestId('matching-books-selection')).toHaveCount(0)

  await adminAction(admin.request, session.id, participantA.userId, { action: 'closeSession' })
  await participantAPage.goto('/matching')
  await participantAPage.reload()
  await expect(participantAPage.getByText('● закрыта')).toBeVisible()
  await expect(participantAPage.getByTestId('matching-books-view')).toContainText('только для просмотра')

  const closed = await getState(participantB.request, session.id)
  const forbidden = await participantB.request.post(`/api/matching/sessions/${session.id}/book-actions`, {
    data: { action: 'setHard', bookId: books[1].id, expectedStateVersion: closed.session.stateVersion },
  })
  expect(forbidden.status()).toBe(409)

  await adminAction(admin.request, session.id, participantA.userId, { action: 'reopenSession' })
  await participantBPage.reload()
  await expect(participantBPage.getByText('● открыта')).toBeVisible()
  await expect(participantBPage.getByTestId(`matching-book-card-${books[1].id}`).getByRole('button', {
    name: 'Записаться', exact: true,
  })).toBeVisible()
})
