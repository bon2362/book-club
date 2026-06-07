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

test('satisfaction session shows human-readable pills and why-text in my moves', async ({
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

  // Setup:
  //   candidateBook: A and B have it at rank 1 ("очень хочу")
  //   fillA, fillB: A and B have them at ranks 2 and 3 (just to push circleBook to rank 4)
  //   circleBook: A, B, Viewer all have it — at rank 4 for A/B ("хочу"), rank 2 for Viewer
  //   viewerOnlyBook: only Viewer has it at rank 1 (pushes circleBook to rank 2 for Viewer)
  //
  // Current leader = circleBook (A:rank4 "хочу", B:rank4 "хочу", Viewer:rank2 "очень хочу")
  //
  // When Viewer adds candidateBook (promoted to rank 1 via promoteBookToFirstRank):
  //   New leader = candidateBook (A:rank1 "очень хочу", B:rank1 "очень хочу", Viewer:rank1)
  //   Viewer improves: rank2 → rank1 (improvedRank=true) → move shows up
  //   A and B: interest improves "хочу" → "очень хочу" → they appear in beneficiaries
  //   beneficiaries: rankBefore=4, afterRank=1 → rankImproved ✓
  //   Pill: "X(dat) и Y(dat) — интереснее"
  //   Why-text: "X ставит твою книгу на 1-е место, а книгу нынешнего круга — на 4-е. ..."
  const circleBook = await createTestBook({
    title: `E2E Satisfaction Circle ${test.info().testId}`,
    author: 'Satisfaction Author',
  })
  const candidateBook = await createTestBook({
    title: `E2E Satisfaction Candidate ${test.info().testId}`,
    author: 'Satisfaction Author',
  })
  const viewerOnlyBook = await createTestBook({
    title: `E2E Satisfaction ViewerOnly ${test.info().testId}`,
    author: 'Satisfaction Author',
  })
  const fillA = await createTestBook({
    title: `E2E Satisfaction FillA ${test.info().testId}`,
    author: 'Satisfaction Author',
  })
  const fillB = await createTestBook({
    title: `E2E Satisfaction FillB ${test.info().testId}`,
    author: 'Satisfaction Author',
  })

  // UserA: candidateBook(rank1) fillA(rank2) fillB(rank3) circleBook(rank4)
  // circleBook rank 4 > 3 → interest = "хочу" (not "очень хочу")
  await loginAsUser({ name: 'E2E Satisfaction A' })
  await joinSessionAndRankBooks(page, session.id, [candidateBook.id, fillA.id, fillB.id, circleBook.id])

  await loginAsUser({ name: 'E2E Satisfaction B' })
  await joinSessionAndRankBooks(page, session.id, [candidateBook.id, fillA.id, fillB.id, circleBook.id])

  // Viewer: viewerOnlyBook(rank1) circleBook(rank2)
  // circleBook rank 2 ≤ 3 → interest = "очень хочу"
  // Adding candidateBook (→ rank1 via promoteBookToFirstRank) improves viewer rank 2→1
  await loginAsUser({ name: 'E2E Satisfaction Viewer MyMoves' })
  await joinSessionAndRankBooks(page, session.id, [viewerOnlyBook.id, circleBook.id])

  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/matching')
  await page.waitForLoadState('networkidle')

  // Viewer has complete ranking (viewerOnlyBook + circleBook ranked) → board rendered at phase="board".
  // ranking-gate element stays in the DOM (inside a closed Collapsible), so we don't check its
  // visibility — instead we confirm the my-moves panel and scenarios are directly visible.
  await expect(page.getByTestId('matching-my-moves-panel')).toBeVisible()
  await expect(page.getByTestId('matching-reader-circles-panel')).toBeVisible()

  const movesPanel = page.getByTestId('matching-my-moves-panel')

  // candidateBook should appear as a move — A and B both have it (≥ minGroupSize-1=2 others)
  await expect(movesPanel.getByText(candidateBook.title)).toBeVisible()

  // Pill: satisfaction mode shows "— интереснее" (A and B both improve rank by switching circles)
  // NOT the old coverage-mode format "↑ ранг X→Y"
  const pillText = await movesPanel.locator('.nd-move-metric').first().textContent()
  expect(pillText).toMatch(/— интереснее|соберётся круг/)
  expect(pillText).not.toMatch(/↑ ранг/)

  // Why-text: contains position numbers like "1-е место" or "2-е место"
  const whyText = await movesPanel.locator('.nd-move-why').first().textContent()
  expect(whyText).toMatch(/-е место/)
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
