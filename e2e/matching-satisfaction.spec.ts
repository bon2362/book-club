import { test, expect, type Page } from './fixtures'

test.describe.configure({ mode: 'serial' })

async function joinSession(page: Page, sessionId: string) {
  const joinRes = await page.request.post(`/api/matching/sessions/${sessionId}/join`)
  if (!joinRes.ok()) {
    throw new Error(`POST /api/matching/sessions/${sessionId}/join failed: ${joinRes.status()} ${await joinRes.text()}`)
  }
}

async function joinSessionAndRankBooks(page: Page, sessionId: string, bookIds: string[]) {
  await joinSession(page, sessionId)
  for (const bookId of bookIds) {
    const addRes = await page.request.post('/api/matching/books', { data: { bookId } })
    if (!addRes.ok()) {
      throw new Error(`POST /api/matching/books failed: ${addRes.status()} ${await addRes.text()}`)
    }
  }
  const rankRes = await page.request.patch('/api/matching/priorities', { data: { bookIds } })
  if (!rankRes.ok()) {
    throw new Error(`PATCH /api/matching/priorities failed: ${rankRes.status()} ${await rankRes.text()}`)
  }
}

async function readScenarioAvgRank(card: ReturnType<Page['getByTestId']>) {
  const text = await card.getByText(/средний ранг \d+\.\d+/).textContent()
  const match = text?.match(/(\d+\.\d+)/)
  if (!match) throw new Error(`Scenario avg rank not found in: ${text ?? '<empty>'}`)
  return Number(match[1])
}

test('satisfaction session gates unranked readers before showing quality-first scenarios', async ({
  page,
  createMatchingSession,
  createTestBook,
  loginAsUser,
}) => {
  const session = await createMatchingSession({
    minGroupSize: 3,
    maxGroupSize: 3,
    optimizationMode: 'satisfaction',
  })
  const perfectBook = await createTestBook({
    title: `E2E Satisfaction Perfect ${test.info().testId}`,
    author: 'Satisfaction Author',
  })
  const fallbackBook = await createTestBook({
    title: `E2E Satisfaction Fallback ${test.info().testId}`,
    author: 'Satisfaction Author',
  })

  await loginAsUser({ name: 'E2E Satisfaction Two' })
  await joinSessionAndRankBooks(page, session.id, [perfectBook.id, fallbackBook.id])

  await loginAsUser({ name: 'E2E Satisfaction Three' })
  await joinSessionAndRankBooks(page, session.id, [perfectBook.id, fallbackBook.id])

  await loginAsUser({ name: 'E2E Satisfaction Viewer' })
  await joinSession(page, session.id)

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/matching')
  await page.waitForLoadState('networkidle')

  await expect(page.getByTestId('ranking-gate')).toBeVisible()
  await expect(page.getByRole('heading', { name: 'Сначала расставьте приоритеты' })).toBeVisible()
  await expect(page.getByTestId('matching-reader-circles-panel')).not.toBeVisible()

  const gate = page.getByTestId('ranking-gate')
  const perfectBookRow = gate.locator('li').filter({ hasText: perfectBook.title }).first()
  await perfectBookRow.hover()
  await perfectBookRow.getByRole('button', { name: 'Хочу читать' }).click()
  await expect(gate.getByTestId('matching-catalog-mine').getByText(perfectBook.title)).toBeVisible()
  const fallbackBookRow = gate.locator('li').filter({ hasText: fallbackBook.title }).first()
  await fallbackBookRow.hover()
  await fallbackBookRow.getByRole('button', { name: 'Хочу читать' }).click()
  await expect(gate.getByTestId('matching-catalog-mine').getByText(fallbackBook.title)).toBeVisible()

  const enter = page.getByTestId('ranking-gate-enter')
  await expect(enter).toBeEnabled()
  await enter.click()
  await page.waitForLoadState('networkidle')

  await expect(page.getByTestId('ranking-gate')).not.toBeVisible()
  await expect(page.getByRole('heading', { name: 'Сценарии' })).toBeVisible()
  const scenariosPanel = page.getByTestId('matching-reader-circles-panel')
  const scenarioCards = scenariosPanel.getByTestId('matching-scenario-card')
  const firstScenario = scenarioCards.nth(0)
  const secondScenario = scenarioCards.nth(1)
  await expect(firstScenario.getByRole('button', { name: perfectBook.title, exact: true })).toBeVisible()
  await expect(secondScenario.getByRole('button', { name: fallbackBook.title, exact: true })).toBeVisible()
  await expect.poll(async () => readScenarioAvgRank(firstScenario)).toBeLessThan(await readScenarioAvgRank(secondScenario))

  // persistence: reload keeps us on the board (ranking complete persisted)
  await page.reload()
  await page.waitForLoadState('networkidle')
  await expect(page.getByTestId('ranking-gate')).not.toBeVisible()
  await expect(page.getByRole('heading', { name: 'Сценарии' })).toBeVisible()
  // board content present (a scenarios surface rendered)
  await expect(
    page.getByText(/Сценарий\s*1|Пока без круга|Сценарии/i).first()
  ).toBeVisible()
})

test('satisfaction session keeps reader gated when a new active signup has no rank', async ({
  page,
  createMatchingSession,
  createTestBook,
  loginAsUser,
}) => {
  const session = await createMatchingSession({
    minGroupSize: 3,
    maxGroupSize: 3,
    optimizationMode: 'satisfaction',
  })
  const rankedBook = await createTestBook({
    title: `E2E Satisfaction Ranked ${test.info().testId}`,
    author: 'Satisfaction Author',
  })
  const unrankedBook = await createTestBook({
    title: `E2E Satisfaction Unranked ${test.info().testId}`,
    author: 'Satisfaction Author',
  })

  await loginAsUser({ name: 'E2E Satisfaction Peer Two' })
  await joinSessionAndRankBooks(page, session.id, [rankedBook.id])

  await loginAsUser({ name: 'E2E Satisfaction Peer Three' })
  await joinSessionAndRankBooks(page, session.id, [rankedBook.id])

  const viewer = await loginAsUser({ name: 'E2E Satisfaction Viewer With New Book' })
  await joinSessionAndRankBooks(page, session.id, [rankedBook.id])

  const signupRes = await page.request.post('/api/test/signup', {
    data: {
      userId: viewer.userId,
      name: viewer.name,
      email: viewer.email,
      contacts: '@viewer',
      selectedBookIds: [rankedBook.id, unrankedBook.id],
    },
  })
  expect(signupRes.ok()).toBe(true)

  await page.goto('/matching')
  await page.waitForLoadState('networkidle')

  await expect(page.getByTestId('ranking-gate')).toBeVisible()
  await expect(page.getByTestId('matching-reader-circles-panel')).not.toBeVisible()
  await expect(page.getByTestId('ranking-gate-enter')).toBeDisabled()
})

test('admin form creates a satisfaction matching session', async ({ page, loginAsAdmin }) => {
  const sessionName = `E2E Admin Satisfaction ${test.info().testId}`
  let createdSessionId: string | null = null

  await loginAsAdmin({ name: 'E2E Satisfaction Admin' })

  try {
    await page.goto('/admin?tab=matching')
    await expect(page.getByTestId('matching-session-name')).toBeVisible()
    await page.getByTestId('matching-session-name').fill(sessionName)
    await page.getByTestId('mode-option-satisfaction').click()

    const createResponsePromise = page.waitForResponse((response) => (
      response.url().endsWith('/api/matching/sessions')
      && response.request().method() === 'POST'
    ))
    await page.getByTestId('matching-session-submit').click()
    const createResponse = await createResponsePromise
    expect(createResponse.status()).toBe(201)
    const createBody = await createResponse.json()
    createdSessionId = createBody.data.id
    expect(createBody.data.optimizationMode).toBe('satisfaction')

    await expect(page.getByTestId('matching-session-chip').filter({ hasText: sessionName })).toBeVisible()
  } finally {
    if (createdSessionId) {
      await page.request.delete('/api/test/matching-session', { data: { id: createdSessionId } })
    }
  }
})
