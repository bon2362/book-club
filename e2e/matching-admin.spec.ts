import type { APIRequestContext } from '@playwright/test'
import { epic, feature } from 'allure-js-commons'
import { test, expect } from './fixtures'

test.describe.configure({ timeout: 120_000 })

type PublicState = {
  session: { stateVersion: number; status: 'open' | 'closed' }
  bookMode: {
    viewerCompleted?: boolean
    books: Array<{
      bookId: string
      circles: Array<{ id: string; memberRefs: string[]; released?: boolean }>
      participants: Array<{ ref: string; completed?: boolean }>
    }>
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

test('администратор отправляет круг читать и возвращает его после reload', { tag: '@matching-golden' }, async ({
  matchingBooksFixture,
  openMatchingPage,
}) => {
  const { session, books, participantA, admin, getParticipantB, getParticipantC } = matchingBooksFixture
  const [participantB, participantC] = await Promise.all([getParticipantB(), getParticipantC()])
  const participantPage = await openMatchingPage(participantA)

  await participantAction(participantB.request, session.id, books[0].id, 'setConditional')
  await participantAction(participantA.request, session.id, books[0].id, 'setHard')
  await participantAction(participantC.request, session.id, books[0].id, 'setHard')
  const formed = await getState(admin.request, session.id)
  const circle = formed.bookMode.books.find((book) => book.bookId === books[0].id)?.circles[0]
  expect(circle).toBeTruthy()

  await adminAction(admin.request, session.id, participantA.userId, { action: 'releaseCircle', circleId: circle!.id })
  // openMatchingPage only signs the identity in; the page itself is still about:blank,
  // so it has to be navigated before reload() can prove anything persisted.
  await participantPage.goto('/matching')
  await participantPage.reload()
  await expect(participantPage.getByTestId('matching-books-view')).toContainText('Ваш подбор завершён')
  await expect(participantPage.getByTestId('matching-books-selection')).toContainText(books[0].title)
  // The banner is the only read-only explanation: no repeated "Записаться пока нельзя"
  // headings, and no card claiming the session is closed while it is still open.
  await expect(participantPage.getByTestId('matching-tail-divider')).toHaveCount(0)
  await expect(participantPage.getByTestId('matching-books-view')).not.toContainText('Сессия закрыта')

  // Счётчик в шапке — про тех, кто ещё выбирает: выпущенный круг из него уходит.
  await expect(participantPage.getByRole('button', { name: /Участники и меню сессии/ }))
    .toHaveAccessibleName('Участники и меню сессии: 0')

  // The organiser keeps a handle on released members: composition controls read this list.
  const released = await getState(admin.request, session.id)
  const releasedBook = released.bookMode.books.find((book) => book.bookId === books[0].id)!
  expect(releasedBook.participants).toHaveLength(3)
  expect(releasedBook.participants.filter((participant) => participant.completed)).toHaveLength(3)

  await adminAction(admin.request, session.id, participantA.userId, { action: 'returnCircle', circleId: circle!.id })
  await participantPage.reload()
  await expect(participantPage.getByTestId('matching-books-view')).not.toContainText('Ваш подбор завершён')
})

test('администратор возвращает одного читателя в подбор, не разбирая круг', { tag: '@matching-golden' }, async ({
  matchingBooksFixture,
  openMatchingPage,
}) => {
  const { session, books, participantA, admin, getParticipantB, getParticipantC } = matchingBooksFixture
  const [participantB, participantC] = await Promise.all([getParticipantB(), getParticipantC()])
  const participantPage = await openMatchingPage(participantA)

  await participantAction(participantB.request, session.id, books[0].id, 'setConditional')
  await participantAction(participantA.request, session.id, books[0].id, 'setHard')
  await participantAction(participantC.request, session.id, books[0].id, 'setHard')
  const formed = await getState(admin.request, session.id)
  const circle = formed.bookMode.books.find((book) => book.bookId === books[0].id)?.circles[0]
  expect(circle).toBeTruthy()
  await adminAction(admin.request, session.id, participantA.userId, { action: 'releaseCircle', circleId: circle!.id })

  // Читает первую книгу, но хочет выбрать ещё одну: возвращаем в подбор его одного.
  await adminAction(admin.request, session.id, participantA.userId, {
    action: 'returnParticipant', userId: participantA.userId,
  })
  await participantPage.goto('/matching')
  await participantPage.reload()
  await expect(participantPage.getByTestId('matching-books-view')).not.toContainText('Ваш подбор завершён')

  // Вторая книга снова доступна для записи, и запись проходит.
  await participantAction(participantA.request, session.id, books[1].id, 'setHard')
  const after = await getState(admin.request, session.id)
  const readingBook = after.bookMode.books.find((book) => book.bookId === books[0].id)!
  expect(readingBook.circles).toHaveLength(1)
  expect(readingBook.circles[0].id).toBe(circle!.id)
  expect(readingBook.circles[0].memberRefs).toHaveLength(3)
  expect(readingBook.circles[0].released).toBe(true)

  // Остальные участники круга по-прежнему вне подбора.
  const stillReleased = after.bookMode.books
    .find((book) => book.bookId === books[0].id)!.participants.filter((item) => item.completed)
  expect(stillReleased).toHaveLength(2)

  // Запись на вторую книгу видна на её карточке; в строке сверху перечислены назначения,
  // а круг по второй книге ещё не собрался, поэтому там по-прежнему только читаемая книга.
  await participantPage.reload()
  await expect(participantPage.getByTestId(`matching-book-card-${books[1].id}`)).toContainText('Вы записаны')
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
  // Участнику список «Без круга: …» не показывают — это админская диагностика; у него исчезает
  // сам блок круга. Ниже, после пересоздания и размещения, тот же регион проверяется на возврат.
  await expect(participantAPage.getByTestId(`matching-book-card-${books[0].id}`)
    .getByRole('region', { name: 'Круг 1' })).toHaveCount(0)

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

test('админская вкладка матчинга показывает спрос по книгам и сохраняет подвкладку после reload', { tag: '@matching-golden' }, async ({
  matchingBooksFixture,
  openMatchingPage,
}) => {
  const { session, books, participantA, admin, getParticipantB, getParticipantC } = matchingBooksFixture
  const [participantB] = await Promise.all([getParticipantB(), getParticipantC()])

  // Обе книги держат в «Хочу читать» трое активных: A — окончательно записан:а на первую,
  // B — авто-запись на неё же, C — только список. До формирования круга не хватает второй hard.
  await participantAction(participantA.request, session.id, books[0].id, 'setHard')
  await participantAction(participantB.request, session.id, books[0].id, 'setConditional')

  const page = await openMatchingPage(admin)
  await page.goto('/admin?tab=matching')

  const demand = page.getByTestId('admin-matching-demand')
  await expect(page.getByTestId('admin-matching-tab-demand')).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('admin-matching-session-bar')).toContainText(session.name)
  await expect(page.getByTestId('admin-matching-summary-activeParticipants')).toHaveText('3')

  const firstBook = demand.locator(`[data-book-id="${books[0].id}"]`)
  const secondBook = demand.locator(`[data-book-id="${books[1].id}"]`)
  await expect(firstBook).toBeVisible()
  await expect(secondBook).toBeVisible()
  // Первая книга выше: у неё ранги лучше; записи на порядок влияют только после рангов.
  const order = await demand.getByTestId('admin-demand-book').evaluateAll(
    (cards) => cards.map((card) => card.getAttribute('data-book-id')),
  )
  expect(order.indexOf(books[0].id)).toBeLessThan(order.indexOf(books[1].id))
  await expect(firstBook.getByTestId('admin-demand-person')).toHaveCount(3)
  await expect(firstBook.locator('[data-testid="admin-demand-person"][data-status="signed_up"]')).toContainText(participantA.name)
  await expect(firstBook.locator('[data-testid="admin-demand-person"][data-status="conditional"]')).toContainText(participantB.name)
  await expect(firstBook.locator('[data-testid="admin-demand-person"][data-status="wishlist"]')).toHaveCount(1)
  await expect(demand.getByRole('button')).toHaveCount(0)

  // Доп. метрики — во всплывающей подсказке: скрыта, пока заголовок не в фокусе.
  const tooltip = firstBook.getByRole('tooltip')
  await expect(tooltip).toBeHidden()
  await firstBook.locator('[aria-describedby]').focus()
  await expect(tooltip).toBeVisible()
  await expect(tooltip).toContainText('Записались')

  // Подвкладка живёт в URL и переживает перезагрузку.
  await page.getByTestId('admin-matching-tab-people').click()
  await expect(page).toHaveURL(/sub=people/)
  await page.reload()
  const people = page.getByTestId('admin-matching-people')
  await expect(page.getByTestId('admin-matching-tab-people')).toHaveAttribute('aria-selected', 'true')
  const rowA = people.getByTestId('admin-participant-row').filter({ hasText: participantA.name })
  await expect(rowA).toBeVisible()

  // Ручное добавление свёрнуто вместе с предупреждением; «убрать» проявляется по наведению.
  await expect(page.getByTestId('admin-add-disclosure-warning')).toHaveCount(0)
  const remove = rowA.getByTestId('admin-participant-remove')
  await expect(remove).toHaveCSS('opacity', '0')
  await rowA.hover()
  await expect(remove).toHaveCSS('opacity', '1')

  // Полный список книг участника — по раскрытию строки.
  await rowA.getByTestId('admin-participant-books-toggle').click()
  await expect(people.getByTestId('admin-participant-books')).toContainText(`«${books[1].title}»`)

  await page.getByTestId('admin-matching-tab-log').click()
  const log = page.getByTestId('admin-matching-log')
  await expect(log.getByTestId('admin-matching-preference-events')).toContainText('Окончательная запись')
  await expect(log).not.toContainText('hard_set')
  await expect(log.getByTestId('admin-matching-event-totals')).toHaveCount(0)
})
