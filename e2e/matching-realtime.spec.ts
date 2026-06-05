/**
 * Регрессионный тест на realtime-обновление страницы /matching.
 *
 * Доказывает: изменение, сделанное ДРУГИМ участником сессии, отражается
 * на странице наблюдателя БЕЗ ручной перезагрузки — за счёт поллинга
 * `state_version` раз в 3с → `router.refresh()`.
 *
 * Observable: переход «нет кругов → есть круги».
 * При minGroupSize=2 достаточно двух участников с одной общей книгой.
 * Пока в сессии только наблюдатель — MatchingScenarios.tsx:59 рендерит
 * «Нужно минимум 2». После того как второй участник (в отдельном браузерном
 * контексте) присоединяется и добавляет ту же книгу — state_version растёт,
 * клиент зовёт router.refresh(), SSR пересчитывает сценарии, и текст
 * «Нужно минимум 2» исчезает.
 *
 * Файл-источник текста: components/nd/MatchingScenarios.tsx:59
 * Файл-источник поллинга: components/nd/MatchingRealtimeClient.tsx (DEFAULT_POLL_INTERVAL_MS=3000)
 */

import { test, expect, type Page } from './fixtures'

/**
 * Создаёт тестового пользователя в отдельном browser-контексте,
 * присоединяет его к сессии, добавляет книгу и ранжирует её.
 * Возвращает псевдоним и функцию очистки сессии.
 */
async function joinAsExtraUser(
  page: Page,
  email: string,
  name: string,
  sessionId: string,
  bookId: string,
): Promise<{ pseudonym: string; cleanup: () => Promise<void> }> {
  // Устанавливаем сессию для доп. пользователя через тот же page-контекст,
  // но на отдельный email — каждый вызов /api/test/session сменяет cookie.
  // Для независимости мы используем отдельный APIRequestContext через browser.newContext().
  // Эта функция принимает page (уже с отдельным context) снаружи.
  const sessionRes = await page.request.post('/api/test/session', {
    data: { email, name, isAdmin: false },
  })
  if (!sessionRes.ok()) {
    throw new Error(`/api/test/session failed: ${sessionRes.status()} ${await sessionRes.text()}`)
  }

  const joinRes = await page.request.post(`/api/matching/sessions/${sessionId}/join`)
  if (!joinRes.ok()) {
    throw new Error(`join failed: ${joinRes.status()} ${await joinRes.text()}`)
  }
  const { pseudonym } = (await joinRes.json()) as { pseudonym: string }

  const addRes = await page.request.post('/api/matching/books', { data: { bookId } })
  if (!addRes.ok()) {
    throw new Error(`add book failed: ${addRes.status()} ${await addRes.text()}`)
  }

  const rankRes = await page.request.patch('/api/matching/priorities', { data: { bookIds: [bookId] } })
  if (!rankRes.ok()) {
    throw new Error(`rank failed: ${rankRes.status()} ${await rankRes.text()}`)
  }

  return {
    pseudonym,
    cleanup: async () => {
      await page.request.delete('/api/test/session', { data: { email } })
    },
  }
}

test(
  'изменение другого участника прилетает на /matching без перезагрузки',
  async ({
    page,
    browser,
    createMatchingSession,
    createTestBook,
    loginAsUser,
  }) => {
    // minGroupSize=2: для формирования круга достаточно 2 участников с одной книгой.
    // Это позволяет обойтись двумя пользователями (наблюдатель + доп. участник).
    const session = await createMatchingSession({ minGroupSize: 2, maxGroupSize: 2 })
    const book = await createTestBook({
      title: `E2E Realtime Book ${test.info().testId}`,
      author: 'Realtime Author',
    })

    // --- Наблюдатель (User B): присоединяемся и открываем /matching ---
    await loginAsUser({ name: 'E2E Realtime Observer' })
    const joinRes = await page.request.post(`/api/matching/sessions/${session.id}/join`)
    if (!joinRes.ok()) {
      throw new Error(`Observer join failed: ${joinRes.status()} ${await joinRes.text()}`)
    }
    const addRes = await page.request.post('/api/matching/books', { data: { bookId: book.id } })
    if (!addRes.ok()) {
      throw new Error(`Observer add book failed: ${addRes.status()} ${await addRes.text()}`)
    }
    const rankRes = await page.request.patch('/api/matching/priorities', { data: { bookIds: [book.id] } })
    if (!rankRes.ok()) {
      throw new Error(`Observer rank failed: ${rankRes.status()} ${await rankRes.text()}`)
    }

    await page.goto('/matching')
    await page.waitForLoadState('networkidle')

    // Наблюдатель уже в сессии → welcome screen не должен появляться.
    // На случай если он всё же появился (race) — кликаем «Войти».
    const joinButton = page.getByRole('button', { name: 'Войти' })
    if (await joinButton.isVisible()) {
      await joinButton.click()
      await page.waitForLoadState('networkidle')
    }

    // Убеждаемся в начальном состоянии: ОДИН участник → кругов нет → виден текст «Нужно минимум 2».
    // (Наблюдатель уже в сессии, но второго участника ещё нет → scenarios.length === 0)
    const emptyStateLocator = page.getByText(/Нужно минимум 2/)
    await expect(emptyStateLocator).toBeVisible({ timeout: 10_000 })

    // --- Второй участник (User A): отдельный browser-контекст ---
    const ctxA = await browser.newContext()
    const pageA = await ctxA.newPage()
    // Блокируем PostHog в доп. контексте
    for (const pattern of [
      '**/eu.i.posthog.com/**',
      '**/eu.posthog.com/**',
      '**/app.posthog.com/**',
    ]) {
      await ctxA.route(pattern, (route) => route.abort())
    }

    const email = `e2e-${test.info().testId}-a@test.invalid`
    const cleanups: Array<() => Promise<void>> = []

    try {
      const { cleanup } = await joinAsExtraUser(
        pageA,
        email,
        'E2E RT User A',
        session.id,
        book.id,
      )
      cleanups.push(cleanup)

      // КЛЮЧЕВАЯ ПРОВЕРКА: БЕЗ page.reload() на странице наблюдателя.
      // Polling (каждые 3с) обнаружит изменение state_version и вызовет router.refresh().
      // После обновления страницы два участника с одной книгой образуют круг →
      // overview.scenarios.length > 0 → MatchingScenarios больше не рендерит «Нужно минимум 2».
      //
      // Таймаут 15_000ms: poll 3с + сетевые задержки + рендер + запас.
      await expect(emptyStateLocator).toBeHidden({ timeout: 15_000 })

      // Дополнительная проверка: heading «Читательские круги» теперь виден —
      // подтверждает, что сценарии действительно сформировались.
      await expect(
        page.getByRole('heading', { name: 'Читательские круги' }),
      ).toBeVisible({ timeout: 5_000 })
    } finally {
      for (const fn of cleanups.reverse()) {
        try {
          await fn()
        } catch {
          // best-effort cleanup
        }
      }
      await pageA.close()
      await ctxA.close()
    }
  },
)
