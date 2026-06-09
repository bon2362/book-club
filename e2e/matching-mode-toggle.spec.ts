import { test, expect, type Page } from './fixtures'

async function joinSessionAndRankBook(page: Page, sessionId: string, bookId: string) {
  const joinRes = await page.request.post(`/api/matching/sessions/${sessionId}/join`)
  expect(joinRes.ok()).toBe(true)

  const addRes = await page.request.post('/api/matching/books', { data: { bookId } })
  expect(addRes.ok()).toBe(true)

  const rankRes = await page.request.patch('/api/matching/priorities', { data: { bookIds: [bookId] } })
  expect(rankRes.ok()).toBe(true)
}

test('admin switches current matching session mode from /matching when priorities are complete', async ({
  page,
  createMatchingSession,
  createTestBook,
  loginAsAdmin,
}) => {
  const session = await createMatchingSession({
    minGroupSize: 2,
    maxGroupSize: 2,
    optimizationMode: 'coverage',
  })
  const book = await createTestBook({
    title: `E2E Mode Toggle ${test.info().testId}`,
    author: 'Mode Toggle Author',
  })

  await loginAsAdmin({ name: 'E2E Mode Toggle Admin' })
  await joinSessionAndRankBook(page, session.id, book.id)

  await page.goto('/matching')
  await page.waitForLoadState('networkidle')

  const toggle = page.getByTestId('matching-mode-toggle')
  await expect(page.getByText('Режим: покрытие')).toBeVisible()
  await expect(toggle).toBeEnabled()
  await expect(toggle).toHaveText('Переключить на удовлетворённость')

  const responsePromise = page.waitForResponse((response) => (
    response.url().includes(`/api/matching/sessions/${session.id}/mode`)
    && response.request().method() === 'PATCH'
  ))
  await toggle.click()
  const response = await responsePromise
  expect(response.status()).toBe(200)
  await page.waitForLoadState('networkidle')

  await expect(page.getByText('Режим: удовлетворённость')).toBeVisible()
  await expect(page.getByTestId('matching-mode-toggle')).toHaveText('Переключить на покрытие')
})

test('обычный пользователь не видит режим в шапке /matching', async ({
  page,
  createMatchingSession,
  createTestBook,
  loginAsUser,
}) => {
  const session = await createMatchingSession({
    minGroupSize: 2,
    maxGroupSize: 2,
    optimizationMode: 'coverage',
  })
  const book = await createTestBook({
    title: `E2E Mode Hidden ${test.info().testId}`,
    author: 'Mode Hidden Author',
  })

  await loginAsUser({ name: 'E2E Mode Hidden User' })
  await joinSessionAndRankBook(page, session.id, book.id)

  await page.goto('/matching')
  await page.waitForLoadState('networkidle')

  // Сессия активна → у не-админа ни строки «Режим:», ни тоггла переключения.
  await expect(page.getByText('Режим:')).toHaveCount(0)
  await expect(page.getByTestId('matching-mode-toggle')).toHaveCount(0)
})
