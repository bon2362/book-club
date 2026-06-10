/**
 * Регрессионный e2e на Ленту матчинга: удаление книги, ухудшающее расклад
 * (но не выбивающее никого из круга), ДОЛЖНО появляться в Ленте.
 *
 * Раньше Лента показывала только улучшения (`hasLeaderImproved`), поэтому
 * «убрал книгу → расклад стал хуже» молчал, хотя добавление той же книги
 * событие создавало. Этот тест фиксирует симметрию.
 *
 * Детерминированный сценарий регрессии без выпадения из круга:
 *   - minGroupSize=2: круг из 2 участников с общей книгой.
 *   - Наблюдатель и доп.участник оба хотят книги X и Y и ранжируют [X, Y].
 *     Лидер — круг вокруг X (rankSum меньше: 1+1 против 2+2).
 *   - Наблюдатель убирает X. X остаётся у одного → круг распадается;
 *     обе книги Y → лидер становится кругом вокруг Y. Охват тот же
 *     {наблюдатель, доп.участник}, никто не выпал, но avgRank вырос →
 *     расклад НЕ улучшился. С фиксом это даёт событие «вы убрали «X»».
 *
 * Источник: lib/matching/feed-events.ts (buildFeedEventsForMutation),
 * рендер: components/nd/MatchingHeader.tsx (MatchingFeedTicker).
 */

import { test, expect, type Page } from './fixtures'

async function joinAddRank(
  page: Page,
  sessionId: string,
  bookIds: string[],
): Promise<{ pseudonym: string }> {
  const joinRes = await page.request.post(`/api/matching/sessions/${sessionId}/join`)
  if (!joinRes.ok()) {
    throw new Error(`join failed: ${joinRes.status()} ${await joinRes.text()}`)
  }
  const { pseudonym } = (await joinRes.json()) as { pseudonym: string }

  for (const bookId of bookIds) {
    const addRes = await page.request.post('/api/matching/books', { data: { bookId } })
    if (!addRes.ok()) {
      throw new Error(`add book failed: ${addRes.status()} ${await addRes.text()}`)
    }
  }
  const rankRes = await page.request.patch('/api/matching/priorities', { data: { bookIds } })
  if (!rankRes.ok()) {
    throw new Error(`rank failed: ${rankRes.status()} ${await rankRes.text()}`)
  }
  return { pseudonym }
}

test(
  'удаление книги, ухудшающее расклад без выпадения из круга, появляется в Ленте',
  async ({
    page,
    browser,
    createMatchingSession,
    createTestBook,
    loginAsUser,
  }) => {
    const session = await createMatchingSession({ minGroupSize: 2, maxGroupSize: 2 })
    const bookX = await createTestBook({
      title: `E2E Feed Regress X ${test.info().testId}`,
      author: 'Feed Regress Author X',
    })
    const bookY = await createTestBook({
      title: `E2E Feed Regress Y ${test.info().testId}`,
      author: 'Feed Regress Author Y',
    })

    // --- Наблюдатель: ранжирует [X, Y] ---
    await loginAsUser({ name: 'E2E Feed Observer' })
    await joinAddRank(page, session.id, [bookX.id, bookY.id])

    // --- Доп.участник в отдельном контексте: тоже [X, Y] ---
    const ctxA = await browser.newContext()
    const pageA = await ctxA.newPage()
    for (const pattern of ['**/eu.i.posthog.com/**', '**/eu.posthog.com/**', '**/app.posthog.com/**']) {
      await ctxA.route(pattern, (route) => route.abort())
    }
    const emailA = `e2e-${test.info().testId}-feed-a@test.invalid`

    try {
      const sessionResA = await pageA.request.post('/api/test/session', {
        data: { email: emailA, name: 'E2E Feed User A', isAdmin: false },
      })
      if (!sessionResA.ok()) {
        throw new Error(`/api/test/session failed: ${sessionResA.status()} ${await sessionResA.text()}`)
      }
      await joinAddRank(pageA, session.id, [bookX.id, bookY.id])

      // Лидер сейчас — круг вокруг X. Наблюдатель убирает X → расклад
      // переключается на круг вокруг Y (хуже по рангу), но охват тот же.
      const removeRes = await page.request.delete(`/api/matching/books/${bookX.id}`)
      if (!removeRes.ok()) {
        throw new Error(`remove book failed: ${removeRes.status()} ${await removeRes.text()}`)
      }

      await page.goto('/matching')
      await page.waitForLoadState('networkidle')
      const joinButton = page.getByRole('button', { name: 'Войти' })
      if (await joinButton.isVisible()) {
        await joinButton.click()
        await page.waitForLoadState('networkidle')
      }

      // Лента есть (события были) → открываем её и проверяем запись об удалении.
      const toggle = page.getByTestId('matching-feed-toggle')
      await expect(toggle).toBeVisible({ timeout: 10_000 })
      await toggle.click()

      const feed = page.getByTestId('matching-feed')
      await expect(feed).toContainText('убрали')
      await expect(feed).toContainText('E2E Feed Regress X')

      // Персистентность: после перезагрузки событие остаётся в Ленте.
      await page.reload()
      await page.waitForLoadState('networkidle')
      const toggleAfter = page.getByTestId('matching-feed-toggle')
      await expect(toggleAfter).toBeVisible({ timeout: 10_000 })
      await toggleAfter.click()
      const feedAfter = page.getByTestId('matching-feed')
      await expect(feedAfter).toContainText('убрали')
      await expect(feedAfter).toContainText('E2E Feed Regress X')
    } finally {
      await page.request.delete('/api/test/session', { data: { email: emailA } }).catch(() => {})
      await pageA.close()
      await ctxA.close()
    }
  },
)
