import { test, expect, type Page } from './fixtures'
import type { Locator } from '@playwright/test'
import { epic, feature } from 'allure-js-commons'

async function joinWithRankedBook(page: Page, sessionId: string, bookId: string, name: string) {
  const join = await page.request.post(`/api/matching/sessions/${sessionId}/join`, { data: { name } })
  expect(join.ok()).toBe(true)
  const add = await page.request.post('/api/matching/books', { data: { bookId } })
  expect(add.ok()).toBe(true)
  const rank = await page.request.patch('/api/matching/priorities', { data: { bookIds: [bookId] } })
  expect(rank.ok()).toBe(true)
}

test.beforeEach(async () => {
  await epic('Матчинг')
  await feature('Упрощённый satisfaction flow')
})

test('ранжированная доска показывает шапку, состав и общий книжный popup', async ({
  matchingBoardFixture,
  dbExec,
}) => {
  const { participantA, participantB, books, session } = matchingBoardFixture
  const page = participantA.page

  await dbExec(
    `update matching_session_participants set last_seen_at = now() - interval '1 hour'
     where session_id = $1 and user_id = $2`,
    [session.id, participantB.userId],
  )

  await page.goto('/matching')
  await expect(page.getByTestId('matching-header')).toContainText(participantA.name)
  await expect(page.getByRole('link', { name: 'На каталог' })).toHaveAttribute('href', '/')
  const participants = page.getByRole('button', { name: /Участники/ })
  await expect(participants).toContainText('2')
  await participants.click()
  const participantDialog = page.getByRole('dialog', { name: 'Участники' })
  await expect(participantDialog).toContainText('Борис E2E')
  await expect(page.getByLabel('Борис E2E — не в сети')).toBeVisible()
  expect((await participantB.page.request.get(`/api/matching/version?session=${session.id}`)).ok()).toBe(true)
  await expect(page.getByLabel('Борис E2E — онлайн')).toBeVisible({ timeout: 15_000 })
  await participantDialog.getByRole('button', { name: /закрыть/i }).click()

  const circle = page.getByTestId('matching-circle').filter({ hasText: books[0].title }).first()
  await expect(circle.getByLabel(`Обложка: ${books[0].title}`)).toBeVisible()
  await circle.getByRole('button', { name: `Открыть книгу «${books[0].title}»` }).click()
  const popup = page.getByRole('dialog')
  await expect(popup).toContainText(books[0].author)
  await popup.getByRole('button', { name: /закрыть/i }).click()
  await page.getByRole('link', { name: 'На каталог' }).click()
  await expect(page).toHaveURL('/')
})

test('confirm, cancel и атомарный switch видны обоим участникам и переживают reload', async ({
  matchingBoardFixture,
}) => {
  test.setTimeout(90_000)
  const { participantA, participantB, books } = matchingBoardFixture
  const page = participantA.page
  const peer = participantB.page

  async function chooseCircle(bookTitle: string) {
    const circle = page.getByTestId('matching-circle').filter({ hasText: bookTitle }).first()
    await circle.hover()
    await circle.getByTestId('circle-confirm-button').click()
    return page.getByRole('dialog')
  }
  async function confirmDialog(dialog: Locator) {
    const response = page.waitForResponse((candidate) => (
      candidate.request().method() === 'PUT' && candidate.url().endsWith(`/api/matching/sessions/${matchingBoardFixture.session.id}/confirmation`)
    ))
    await dialog.getByRole('button', { name: 'Подтвердить' }).click()
    expect((await response).ok()).toBe(true)
  }

  await page.goto('/matching')
  let dialog = await chooseCircle(books[0].title)
  await expect(dialog).toContainText('Подтвердить круг?')
  await confirmDialog(dialog)
  await page.reload()
  await expect(page.getByTestId('circle-waiting')).toContainText('1 из 2 · временно')

  await peer.goto('/matching')
  const peerFirstCircle = peer.getByTestId('matching-circle').filter({ hasText: books[0].title }).first()
  await expect(peerFirstCircle.getByLabel('Анна E2E: подтвердил')).toBeVisible()

  const cancelResponse = page.waitForResponse((candidate) => (
    candidate.request().method() === 'DELETE' && candidate.url().endsWith(`/api/matching/sessions/${matchingBoardFixture.session.id}/confirmation`)
  ))
  await page.getByTestId('circle-cancel-button').click()
  expect((await cancelResponse).ok()).toBe(true)
  await page.reload()
  await expect(page.getByTestId('circle-waiting')).toHaveCount(0)
  await peer.reload()
  await expect(peerFirstCircle.getByLabel('Анна E2E: не подтвердил')).toBeVisible()

  dialog = await chooseCircle(books[0].title)
  await confirmDialog(dialog)
  await page.reload()
  dialog = await chooseCircle(books[1].title)
  await expect(dialog).toHaveAccessibleName('Сменить круг?')
  await expect(dialog).toContainText(books[0].title)
  await expect(dialog).toContainText(books[1].title)
  await expect(dialog).toContainText(/прежнее снимется/i)
  await confirmDialog(dialog)
  await page.reload()
  await expect(page.getByTestId('circle-waiting')).toHaveCount(1)
  await expect(page.getByTestId('matching-circle').filter({ hasText: books[1].title }).getByTestId('circle-waiting')).toBeVisible()
  await expect(page.getByTestId('matching-circle').filter({ hasText: books[0].title }).getByTestId('circle-waiting')).toHaveCount(0)
})

test('первый concurrent confirm конфликтует, а retry победителя идемпотентен', async ({
  matchingBoardFixture,
  dbExec,
}) => {
  const { participantA, session } = matchingBoardFixture
  const stateResponse = await participantA.page.request.get(`/api/matching/state?session=${session.id}`)
  expect(stateResponse.ok()).toBe(true)
  const state = await stateResponse.json() as {
    session: { stateVersion: number }
    scenarios: Array<{ circles: Array<{ circleKey: string; viewerIsMember: boolean }> }>
  }
  const choices = state.scenarios.flatMap((scenario) => scenario.circles)
    .filter((circle) => circle.viewerIsMember)
    .map((circle) => circle.circleKey)
  expect(new Set(choices).size).toBeGreaterThanOrEqual(2)
  const expectedStateVersion = state.session.stateVersion
  const url = `/api/matching/sessions/${session.id}/confirmation`
  const [first, second] = await Promise.all([
    participantA.page.request.put(url, { data: { circleKey: choices[0], expectedStateVersion } }),
    participantA.page.request.put(url, { data: { circleKey: choices[1], expectedStateVersion } }),
  ])
  expect([first.status(), second.status()].sort()).toEqual([200, 409])
  const winnerIndex = first.status() === 200 ? 0 : 1

  const retry = await participantA.page.request.put(url, {
    data: { circleKey: choices[winnerIndex], expectedStateVersion },
  })
  expect(retry.status()).toBe(200)
  await expect(retry.json()).resolves.toMatchObject({ changed: false })

  const events = await dbExec(
    `select event_type from matching_events
     where session_id = $1 and event_type in ('confirmation_created', 'confirmation_switched')`,
    [session.id],
  )
  expect(events).toHaveLength(1)
})

test('исчезнувший состав переносит выбор по книге, а отсутствие альтернативы сбрасывает его с durable notice', async ({
  matchingBoardFixture,
}) => {
  test.setTimeout(90_000)
  const { participantA, participantB, books, session, addParticipant } = matchingBoardFixture
  const participantC = await addParticipant('Вера E2E', [books[0]])

  type State = {
    session: { stateVersion: number }
    viewer: { ref: string }
    participants: Array<{ ref: string; confirmedCircleKey: string | null }>
    scenarios: Array<{ circles: Array<{
      circleKey: string
      bookId: string
      members: Array<{ displayName: string }>
      viewerIsMember: boolean
    }> }>
    notices: Array<{ id: string; kind: string; payload: { fromMembers?: string[]; toMembers?: string[]; members?: string[] } }>
  }
  async function state(): Promise<State> {
    const response = await participantA.page.request.get(`/api/matching/state?session=${session.id}`)
    expect(response.ok()).toBe(true)
    return response.json() as Promise<State>
  }
  function ownConfirmation(current: State) {
    return current.participants.find((participant) => participant.ref === current.viewer.ref)?.confirmedCircleKey ?? null
  }

  let current = await state()
  const original = current.scenarios.flatMap((scenario) => scenario.circles).find((circle) => (
    circle.bookId === books[0].id &&
    circle.viewerIsMember &&
    circle.members.some((member) => member.displayName === participantB.name) &&
    !circle.members.some((member) => member.displayName === participantC.name)
  ))
  expect(original).toBeTruthy()
  const firstConfirm = await participantA.page.request.put(`/api/matching/sessions/${session.id}/confirmation`, {
    data: { circleKey: original!.circleKey, expectedStateVersion: current.session.stateVersion },
  })
  expect(firstConfirm.ok()).toBe(true)

  const removeFirst = await participantB.page.request.delete(`/api/matching/books/${books[0].id}`)
  expect(removeFirst.ok()).toBe(true)
  current = await state()
  const transferredKey = ownConfirmation(current)
  expect(transferredKey).not.toBeNull()
  expect(transferredKey).not.toBe(original!.circleKey)
  const transferredCircle = current.scenarios.flatMap((scenario) => scenario.circles)
    .find((circle) => circle.circleKey === transferredKey)
  expect(transferredCircle?.bookId).toBe(books[0].id)
  expect(transferredCircle?.members.map((member) => member.displayName).sort()).toEqual(['Анна E2E', 'Вера E2E'].sort())
  const transferNotice = current.notices.find((notice) => notice.kind === 'confirmation_transferred')
  expect(transferNotice?.payload.fromMembers?.sort()).toEqual(['Анна E2E', 'Борис E2E'].sort())
  expect(transferNotice?.payload.toMembers?.sort()).toEqual(['Анна E2E', 'Вера E2E'].sort())

  await participantA.page.goto('/matching')
  await expect(participantA.page.getByTestId('matching-notices')).toContainText('Вера E2E')
  await participantA.page.reload()
  await expect(participantA.page.getByTestId('matching-notices')).toContainText('Вера E2E')
  const ackResponse = participantA.page.waitForResponse((response) => (
    response.request().method() === 'POST' && response.url().includes('/api/matching/notices/')
  ))
  await participantA.page.getByRole('button', { name: 'Понятно' }).click()
  expect((await ackResponse).ok()).toBe(true)
  await participantA.page.reload()
  await expect(participantA.page.getByTestId('matching-notices')).toHaveCount(0)

  current = await state()
  const secondBookCircle = current.scenarios.flatMap((scenario) => scenario.circles).find((circle) => (
    circle.bookId === books[1].id && circle.viewerIsMember
  ))
  expect(secondBookCircle).toBeTruthy()
  const switchResponse = await participantA.page.request.put(`/api/matching/sessions/${session.id}/confirmation`, {
    data: { circleKey: secondBookCircle!.circleKey, expectedStateVersion: current.session.stateVersion },
  })
  expect(switchResponse.ok()).toBe(true)
  const removeSecond = await participantB.page.request.delete(`/api/matching/books/${books[1].id}`)
  expect(removeSecond.ok()).toBe(true)

  current = await state()
  expect(ownConfirmation(current)).toBeNull()
  const invalidation = current.notices.find((notice) => notice.kind === 'confirmation_invalidated')
  expect(invalidation?.payload.members?.sort()).toEqual(['Анна E2E', 'Борис E2E'].sort())
  await participantA.page.reload()
  await expect(participantA.page.getByTestId('circle-waiting')).toHaveCount(0)
  await expect(participantA.page.getByTestId('matching-notices')).toContainText(/подтверждение снято/i)
})

test('Welcome раскрывает реальные имена и сохраняет исправленное глобальное имя', async ({
  page,
  createMatchingSession,
  loginAsUser,
}) => {
  await createMatchingSession({ minGroupSize: 2, maxGroupSize: 2 })
  await loginAsUser({ name: 'Старое имя' })

  await page.goto('/matching')
  await expect(page.getByText(/реальные имена видны всем участникам/i)).toBeVisible()
  await expect(page.getByText(/составить группы и общаться через Telegram/i)).toBeVisible()
  await expect(page.getByTestId('welcome-name-input')).toHaveValue('Старое имя')
  await expect(page.getByRole('button', { name: /написать в Telegram/i })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /написать в Telegram/i })).toHaveCount(0)

  await page.getByTestId('welcome-name-input').fill('Новое имя')
  await page.getByTestId('welcome-join-button').click()
  await expect(page.getByTestId('matching-realtime-client')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByTestId('ranking-gate')).toHaveCount(0)
  await expect(page.getByTestId('matching-header')).toBeVisible()
  await expect(page.getByTestId('matching-scenarios-workspace')).toBeVisible()
  await expect(page.getByTestId('matching-catalog-panel')).toBeVisible()

  await page.reload()
  await expect(page.getByTestId('welcome-name-input')).toHaveCount(0)
  const me = await page.request.get('/api/me')
  expect(me.ok()).toBe(true)
  expect(((await me.json()) as { user: { name: string } }).user.name).toBe('Новое имя')
})

test('Welcome → Ranking Gate → UI-ранжирование → доска сохраняют порядок после reload', async ({
  page,
  createMatchingSession,
  createTestBook,
  loginAsUser,
}) => {
  test.setTimeout(90_000)
  const session = await createMatchingSession({ minGroupSize: 2, maxGroupSize: 2 })
  const bookA = await createTestBook({ title: `E2E Gate A ${test.info().testId}`, author: 'Gate Author' })
  const bookB = await createTestBook({ title: `E2E Gate B ${test.info().testId}`, author: 'Gate Author' })
  const user = await loginAsUser({ name: 'Читатель Gate' })
  expect((await page.request.post('/api/test/signup', {
    data: {
      userId: user.userId,
      name: user.name,
      email: user.email,
      contacts: '',
      selectedBookIds: [bookA.id, bookB.id],
    },
  })).ok()).toBe(true)

  await page.goto('/matching')
  await page.waitForLoadState('networkidle')
  await expect(page.getByTestId('welcome-name-input')).toHaveValue('Читатель Gate')
  const joinResponse = page.waitForResponse((response) => (
    response.request().method() === 'POST' && response.url().endsWith(`/api/matching/sessions/${session.id}/join`)
  ))
  await page.getByTestId('welcome-join-button').click()
  expect((await joinResponse).ok()).toBe(true)
  await expect(page.getByTestId('ranking-gate')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('heading', { name: 'Сначала — расставь приоритеты' })).toBeVisible()
  await expect(page.getByTestId('matching-realtime-client')).toHaveCount(0)
  await page.waitForLoadState('networkidle')
  const enter = page.getByTestId('ranking-gate-enter')
  // Two active books already have a default rank each from add-to-list — CTA is enabled.
  await expect(enter).toBeEnabled()

  const rankResponse = page.waitForResponse((response) => (
    response.request().method() === 'PATCH' && response.url().includes('/api/matching/priorities')
  ))
  const firstHandle = page.getByLabel(`Перетащить книгу ${bookA.title}`)
  const secondHandle = page.getByLabel(`Перетащить книгу ${bookB.title}`)
  const source = await firstHandle.boundingBox()
  const target = await secondHandle.boundingBox()
  expect(source).not.toBeNull()
  expect(target).not.toBeNull()
  await page.mouse.move(source!.x + source!.width / 2, source!.y + source!.height / 2)
  await page.mouse.down()
  await page.mouse.move(source!.x + source!.width / 2 + 8, source!.y + source!.height / 2 + 8, { steps: 3 })
  await page.mouse.move(target!.x + target!.width / 2, target!.y + target!.height / 2, { steps: 12 })
  await page.mouse.up()
  expect((await rankResponse).ok()).toBe(true)
  await expect(page.getByTestId('dnd-announcement')).toContainText(`${bookA.title} перемещена на позицию 2`)

  const rankedRows = page.getByTestId('pl-books-ul').locator(':scope > li')
  await expect(rankedRows).toHaveCount(2)
  await expect(rankedRows.nth(0)).toContainText(bookB.title)
  await expect(rankedRows.nth(0)).toContainText('#1')
  await expect(rankedRows.nth(1)).toContainText(bookA.title)
  await expect(rankedRows.nth(1)).toContainText('#2')
  await expect(enter).toBeEnabled()

  await enter.click()
  await expect(page.getByTestId('ranking-gate')).toHaveCount(0)
  await expect(page.getByTestId('matching-realtime-client')).toBeVisible()
  await page.reload()
  await expect(page.getByTestId('matching-header')).toContainText('Читатель Gate')
  const persistedRows = page.getByTestId('pl-books-ul').locator(':scope > li')
  await expect(persistedRows.nth(0)).toContainText(bookB.title)
  await expect(persistedRows.nth(0)).toContainText('#1')
  await expect(persistedRows.nth(1)).toContainText(bookA.title)
  await expect(persistedRows.nth(1)).toContainText('#2')
})

test('Ranking Gate: одна книга без явного drag-реордера всё равно сохраняет ранг после входа (#4)', async ({
  page,
  createMatchingSession,
  createTestBook,
  loginAsUser,
}) => {
  const session = await createMatchingSession({ minGroupSize: 2, maxGroupSize: 2 })
  const book = await createTestBook({ title: `E2E Gate Single ${test.info().testId}`, author: 'Gate Author' })
  const user = await loginAsUser({ name: 'Читатель Одна Книга' })
  expect((await page.request.post('/api/test/signup', {
    data: {
      userId: user.userId,
      name: user.name,
      email: user.email,
      contacts: '',
      selectedBookIds: [book.id],
    },
  })).ok()).toBe(true)

  await page.goto('/matching')
  await page.waitForLoadState('networkidle')
  const joinResponse = page.waitForResponse((response) => (
    response.request().method() === 'POST' && response.url().endsWith(`/api/matching/sessions/${session.id}/join`)
  ))
  await page.getByTestId('welcome-join-button').click()
  expect((await joinResponse).ok()).toBe(true)
  await expect(page.getByTestId('ranking-gate')).toBeVisible({ timeout: 15_000 })
  await page.waitForLoadState('networkidle')

  const enter = page.getByTestId('ranking-gate-enter')
  // Single active book — dnd-kit never fires a reorder, but CTA is enabled anyway.
  await expect(enter).toBeEnabled()

  const rankResponse = page.waitForResponse((response) => (
    response.request().method() === 'PATCH' && response.url().includes('/api/matching/priorities')
  ))
  await enter.click()
  expect((await rankResponse).ok()).toBe(true)
  await expect(page.getByTestId('ranking-gate')).toHaveCount(0)
  await expect(page.getByTestId('matching-realtime-client')).toBeVisible()

  await page.reload()
  await expect(page.getByTestId('ranking-gate')).toHaveCount(0)
  await expect(page.getByTestId('matching-realtime-client')).toBeVisible()
  const persistedRows = page.getByTestId('pl-books-ul').locator(':scope > li')
  await expect(persistedRows).toHaveCount(1)
  await expect(persistedRows.nth(0)).toContainText(book.title)
  await expect(persistedRows.nth(0)).toContainText('#1')
})

test('выход из сессии делает hard navigation и остаётся Welcome после reload', async ({
  page,
  createMatchingSession,
  createTestBook,
  loginAsUser,
}) => {
  const session = await createMatchingSession({ minGroupSize: 2, maxGroupSize: 2 })
  const book = await createTestBook({ title: `E2E Leave ${test.info().testId}`, author: 'Leave Author' })
  await loginAsUser({ name: 'Читатель Leave' })
  await joinWithRankedBook(page, session.id, book.id, 'Читатель Leave')
  await page.goto('/matching')
  await expect(page.getByTestId('matching-realtime-client')).toBeVisible()

  page.once('dialog', (dialog) => dialog.accept())
  await Promise.all([
    page.waitForURL(/\/matching$/),
    page.getByRole('button', { name: 'Покинуть' }).click(),
  ])
  await expect(page.getByTestId('welcome-name-input')).toBeVisible()
  await page.reload()
  await expect(page.getByTestId('welcome-name-input')).toBeVisible()
})

test('удалённая заморозка обновляет SSR-каталог и убирает mutation controls', async ({
  page,
  browser,
  createMatchingSession,
  createTestBook,
  loginAsUser,
}) => {
  test.setTimeout(60_000)
  const session = await createMatchingSession({ minGroupSize: 2, maxGroupSize: 2 })
  const book = await createTestBook({ title: `E2E Freeze ${test.info().testId}`, author: 'Freeze Author' })
  await loginAsUser({ name: 'Читатель Freeze' })
  await joinWithRankedBook(page, session.id, book.id, 'Читатель Freeze')
  await page.goto('/matching')
  await expect(page.getByRole('button', { name: 'Убрать из списка' })).toBeVisible()
  await expect(page.getByLabel(`Перетащить книгу ${book.title}`)).toBeVisible()

  const adminContext = await browser.newContext()
  const admin = await adminContext.newPage()
  const adminEmail = `e2e-freeze-admin-${Date.now()}@test.invalid`
  try {
    expect((await admin.request.post('/api/test/session', {
      data: { email: adminEmail, name: 'Админ Freeze', isAdmin: true },
    })).ok()).toBe(true)
    expect((await admin.request.post(`/api/matching/sessions/${session.id}/freeze`)).ok()).toBe(true)

    await expect(page.getByText('● заморожена')).toBeVisible({ timeout: 15_000 })
    await expect(page.getByRole('button', { name: 'Убрать из списка' })).toHaveCount(0)
    await expect(page.getByLabel(`Перетащить книгу ${book.title}`)).toHaveCount(0)
    await page.reload()
    await expect(page.getByRole('button', { name: 'Убрать из списка' })).toHaveCount(0)
  } finally {
    await admin.request.delete('/api/test/session', { data: { email: adminEmail } }).catch(() => {})
    await adminContext.close()
  }
})

test('подтверждение переживает reload, видно другому участнику и закрепляет круг в observer mode', async ({
  page,
  browser,
  createMatchingSession,
  createTestBook,
  loginAsAdmin,
}) => {
  test.setTimeout(90_000)
  const session = await createMatchingSession({ minGroupSize: 2, maxGroupSize: 2 })
  const book = await createTestBook({ title: `E2E Circle ${test.info().testId}`, author: 'Circle Author' })
  await loginAsAdmin({ name: 'Анна E2E' })
  await joinWithRankedBook(page, session.id, book.id, 'Анна E2E')

  const peerContext = await browser.newContext()
  const peer = await peerContext.newPage()
  const peerEmail = `e2e-matching-peer-${Date.now()}@test.invalid`
  try {
    expect((await peer.request.post('/api/test/session', {
      data: { email: peerEmail, name: 'Борис E2E', telegramUsername: 'boris_e2e' },
    })).ok()).toBe(true)
    await joinWithRankedBook(peer, session.id, book.id, 'Борис E2E')

    await page.goto('/matching')
    await expect(page.getByTestId('matching-scenario-card').first()).toBeVisible()
    await page.getByTestId('matching-circle').first().hover()
    await page.getByTestId('circle-confirm-button').first().click()
    const dialog = page.getByRole('dialog')
    await expect(dialog.getByText('Подтвердить круг?')).toBeVisible()
    const confirmationResponse = page.waitForResponse((response) => (
      response.request().method() === 'PUT' &&
      response.url().endsWith(`/api/matching/sessions/${session.id}/confirmation`)
    ))
    await dialog.getByRole('button', { name: 'Подтвердить' }).click()
    expect((await confirmationResponse).ok()).toBe(true)
    await page.reload()
    await expect(page.getByTestId('circle-waiting').first()).toContainText('1 из 2 · временно')

    const peerStateResponse = await peer.request.get(`/api/matching/state?session=${session.id}`)
    expect(peerStateResponse.ok()).toBe(true)
    const peerState = await peerStateResponse.json() as {
      session: { stateVersion: number }
      scenarios: Array<{ circles: Array<{ circleKey: string; viewerIsMember: boolean; members: Array<{ displayName: string; confirmed: boolean }> }> }>
    }
    const circle = peerState.scenarios.flatMap((scenario) => scenario.circles).find((candidate) => candidate.viewerIsMember)
    expect(circle).toBeTruthy()
    expect(circle!.members.find((member) => member.displayName === 'Анна E2E')?.confirmed).toBe(true)

    const lock = await peer.request.put(`/api/matching/sessions/${session.id}/confirmation`, {
      data: { circleKey: circle!.circleKey, expectedStateVersion: peerState.session.stateVersion },
    })
    expect(lock.ok()).toBe(true)

    await page.reload()
    await expect(page.getByTestId('matching-locked-circles')).toBeVisible()
    await expect(page.getByTestId('matching-header').getByText('Вы наблюдаете')).toBeVisible()
    await expect(page.getByTestId('circle-confirm-button')).toHaveCount(0)

    await page.goto('/admin?tab=matching')
    const lockedCircleRow = page.getByTestId('locked-circle-row')
    await expect(lockedCircleRow).toContainText(book.title)
    await expect(lockedCircleRow).toContainText('Анна E2E')
    await expect(lockedCircleRow).toContainText('Борис E2E')
  } finally {
    await peer.request.delete('/api/test/session', { data: { email: peerEmail } }).catch(() => {})
    await peerContext.close()
  }
})
