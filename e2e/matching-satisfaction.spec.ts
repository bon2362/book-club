import { test, expect, type Page } from './fixtures'
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

test('Welcome раскрывает реальные имена и сохраняет исправленное глобальное имя', async ({
  page,
  createMatchingSession,
  loginAsUser,
}) => {
  await createMatchingSession({ minGroupSize: 2, maxGroupSize: 2 })
  await loginAsUser({ name: 'Старое имя' })

  await page.goto('/matching')
  await expect(page.getByText(/реальные имена видны всем участникам/i)).toBeVisible()
  await expect(page.getByTestId('welcome-name-input')).toHaveValue('Старое имя')
  await expect(page.getByText(/telegram/i)).toHaveCount(0)

  await page.getByTestId('welcome-name-input').fill('Новое имя')
  await page.getByTestId('welcome-join-button').click()
  await expect(page.getByTestId('matching-realtime-client')).toBeVisible({ timeout: 15_000 })

  await page.reload()
  await expect(page.getByTestId('welcome-name-input')).toHaveCount(0)
  const me = await page.request.get('/api/me')
  expect(me.ok()).toBe(true)
  expect(((await me.json()) as { user: { name: string } }).user.name).toBe('Новое имя')
})

test('Ranking Gate появляется только для активной книги без ранга и исчезает после reload', async ({
  page,
  createMatchingSession,
  createTestBook,
  loginAsUser,
}) => {
  const session = await createMatchingSession({ minGroupSize: 2, maxGroupSize: 2 })
  const book = await createTestBook({ title: `E2E Gate ${test.info().testId}`, author: 'Gate Author' })
  await loginAsUser({ name: 'Читатель Gate' })
  expect((await page.request.post(`/api/matching/sessions/${session.id}/join`, { data: { name: 'Читатель Gate' } })).ok()).toBe(true)
  expect((await page.request.post('/api/matching/books', { data: { bookId: book.id } })).ok()).toBe(true)

  await page.goto('/matching')
  await expect(page.getByTestId('ranking-gate')).toBeVisible()
  await expect(page.getByTestId('matching-realtime-client')).toHaveCount(0)

  expect((await page.request.patch('/api/matching/priorities', { data: { bookIds: [book.id] } })).ok()).toBe(true)
  await page.reload()
  await expect(page.getByTestId('ranking-gate')).toHaveCount(0)
  await expect(page.getByTestId('matching-realtime-client')).toBeVisible()
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
    await expect(page.getByText('Вы наблюдаете')).toBeVisible()
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
