import { test, expect, type Page } from './fixtures'
import type { APIRequestContext, Browser, BrowserContext } from '@playwright/test'
import { epic, feature } from 'allure-js-commons'

type PublicState = {
  session: { stateVersion: number }
  viewer: { role: 'active' | 'observer' }
  scenarios: Array<{ circles: Array<{
    circleKey: string
    bookId: string
    viewerIsMember: boolean
    members: Array<{ displayName: string }>
  }> }>
}

async function getState(request: APIRequestContext, sessionId: string): Promise<PublicState> {
  const response = await request.get(`/api/matching/state?session=${sessionId}`)
  expect(response.ok()).toBe(true)
  return response.json() as Promise<PublicState>
}

async function confirm(request: APIRequestContext, sessionId: string, circleKey: string) {
  const state = await getState(request, sessionId)
  const response = await request.put(`/api/matching/sessions/${sessionId}/confirmation`, {
    data: { circleKey, expectedStateVersion: state.session.stateVersion },
  })
  expect(response.ok(), await response.text()).toBe(true)
}

async function loginAdmin(browser: Browser): Promise<{ context: BrowserContext; page: Page; email: string; userId: string }> {
  const context = await browser.newContext()
  const page = await context.newPage()
  const email = `e2e-matching-admin-${Date.now()}-${Math.random()}@test.invalid`
  const response = await page.request.post('/api/test/session', {
    data: { email, name: 'Администратор E2E', isAdmin: true },
  })
  expect(response.ok()).toBe(true)
  const { userId } = await response.json() as { userId: string }
  return { context, page, email, userId }
}

test.beforeEach(async () => {
  await epic('Матчинг')
  await feature('Observer и аварийные действия администратора')
})

test('полный круг становится read-only observer, исключается из расчёта и возвращается только целиком через admin dissolve', async ({
  matchingBoardFixture,
  browser,
  auditCleanup,
}) => {
  test.setTimeout(120_000)
  const { session, books, participantA, participantB, addParticipant } = matchingBoardFixture
  const firstState = await getState(participantA.page.request, session.id)
  const circle = firstState.scenarios.flatMap((scenario) => scenario.circles).find((candidate) => (
    candidate.bookId === books[0].id && candidate.viewerIsMember &&
    candidate.members.map((member) => member.displayName).sort().join('|') === ['Анна E2E', 'Борис E2E'].sort().join('|')
  ))
  expect(circle).toBeTruthy()

  await confirm(participantA.page.request, session.id, circle!.circleKey)
  await confirm(participantB.page.request, session.id, circle!.circleKey)

  const admin = await loginAdmin(browser)
  auditCleanup.trackUser(admin.userId)
  let lockedBefore: { id: string; circleKey: string; bookId: string; status: string; members: Array<{ userId: string; displayNameSnapshot: string }> }
  try {
    const lockedBeforeResponse = await admin.page.request.get(`/api/admin/matching/sessions/${session.id}/locked-circles`)
    const lockedBeforePayload = await lockedBeforeResponse.json() as { data: typeof lockedBefore[] }
    lockedBefore = lockedBeforePayload.data.find((item) => item.status === 'locked')!
    expect(lockedBefore).toBeTruthy()
  } catch (error) {
    await admin.page.request.delete('/api/test/session', { data: { email: admin.email } }).catch(() => {})
    await admin.context.close()
    throw error
  }

  for (const participant of [participantA, participantB]) {
    await participant.page.goto('/matching')
    await participant.page.reload()
    await expect(participant.page.getByTestId('matching-own-locked-circle')).toContainText('Ваш круг')
    await expect(participant.page.getByTestId('matching-header')).toContainText('Вы наблюдаете')
    await expect(participant.page.getByTestId('circle-confirm-button')).toHaveCount(0)
    const state = await getState(participant.page.request, session.id)
    expect(state.viewer.role).toBe('observer')
    const cancel = await participant.page.request.delete(`/api/matching/sessions/${session.id}/confirmation`, {
      data: { expectedStateVersion: state.session.stateVersion },
    })
    expect(cancel.status()).toBe(409)
  }

  const participantC = await addParticipant('Вера E2E', [books[1]])
  const participantD = await addParticipant('Глеб E2E', [books[1]])
  const activeState = await getState(participantC.page.request, session.id)
  const liveNames = activeState.scenarios.flatMap((scenario) => scenario.circles)
    .flatMap((candidate) => candidate.members.map((member) => member.displayName))
  expect(liveNames).toEqual(expect.arrayContaining([participantC.name, participantD.name]))
  expect(liveNames).not.toEqual(expect.arrayContaining([participantA.name, participantB.name]))

  try {
    const lockedAfterResponse = await admin.page.request.get(`/api/admin/matching/sessions/${session.id}/locked-circles`)
    const lockedAfterPayload = await lockedAfterResponse.json() as { data: typeof lockedBefore[] }
    const lockedAfter = lockedAfterPayload.data.find((item) => item.id === lockedBefore.id)
    expect(lockedAfter).toEqual(lockedBefore)

    const participantsBefore = await admin.page.request.get(`/api/admin/matching/sessions/${session.id}/participants`)
    const beforePayload = await participantsBefore.json() as { data: Array<{ userId: string; role: string; name: string }> }
    expect(beforePayload.data.filter((item) => [participantA.userId, participantB.userId].includes(item.userId)).map((item) => item.role))
      .toEqual(['observer', 'observer'])

    const removeObserver = await admin.page.request.delete(
      `/api/admin/matching/sessions/${session.id}/participants/${participantA.userId}`,
    )
    expect(removeObserver.status()).toBe(409)

    const circlesResponse = await admin.page.request.get(`/api/admin/matching/sessions/${session.id}/locked-circles`)
    const circles = await circlesResponse.json() as { data: Array<{ id: string; status: string }> }
    const locked = circles.data.find((item) => item.status === 'locked')
    expect(locked).toBeTruthy()
    const participantDissolve = await participantA.page.request.post(
      `/api/admin/matching/sessions/${session.id}/circles/${locked!.id}/dissolve`,
      { data: { reason: 'Участник не должен уметь распускать круг' } },
    )
    expect(participantDissolve.status()).toBe(403)
    const missingReason = await admin.page.request.post(
      `/api/admin/matching/sessions/${session.id}/circles/${locked!.id}/dissolve`,
      { data: { reason: '   ' } },
    )
    expect(missingReason.status()).toBe(400)

    await admin.page.goto('/admin?tab=matching')
    await expect(admin.page.getByTestId('admin-add-disclosure-warning')).toContainText('обходит раскрытие реального имени')
    const lockedRow = admin.page.getByTestId('locked-circle-row').filter({ hasText: books[0].title })
    await expect(lockedRow).toContainText('Анна E2E')
    await expect(lockedRow).toContainText('Борис E2E')
    await expect(admin.page.getByTestId('remove-observer-disabled')).toHaveCount(2)
    await lockedRow.getByTestId('dissolve-circle-btn').click()
    const dialog = admin.page.getByRole('dialog')
    await expect(dialog).toContainText(books[0].title)
    await expect(dialog).toContainText('Анна E2E')
    await dialog.getByTestId('dissolve-reason-input').fill('Исправление тестового состава')
    await dialog.getByTestId('dissolve-confirm-btn').click()
    await expect(lockedRow).toContainText('распущен')

    await expect.poll(async () => {
      const response = await admin.page.request.get(`/api/admin/matching/sessions/${session.id}/participants`)
      const payload = await response.json() as { data: Array<{ userId: string; role: string }> }
      return payload.data
        .filter((item) => [participantA.userId, participantB.userId].includes(item.userId))
        .map((item) => item.role)
        .sort()
    }).toEqual(['active', 'active'])

    for (const participant of [participantA, participantB]) {
      await participant.page.reload()
      await expect(participant.page.getByTestId('matching-own-locked-circle')).toHaveCount(0)
      await expect(participant.page.getByTestId('matching-header')).toContainText(`Вы — ${participant.name}`)
      await expect(participant.page.getByTestId('matching-notices')).toContainText(/распустил круг/i)
    }
  } finally {
    await admin.page.request.delete('/api/test/session', { data: { email: admin.email } }).catch(() => {})
    await admin.context.close()
  }
})

test('admin force-add, remove, group size, impersonation и freeze сохраняются после reload', async ({
  matchingBoardFixture,
  browser,
  dbExec,
  auditCleanup,
}) => {
  test.setTimeout(90_000)
  const { session, participantA } = matchingBoardFixture
  const candidateContext = await browser.newContext()
  const candidate = await candidateContext.newPage()
  const candidateEmail = `e2e-force-add-${Date.now()}@test.invalid`
  const candidateLogin = await candidate.request.post('/api/test/session', {
    data: { email: candidateEmail, name: 'Добавленный E2E', telegramUsername: 'forced_e2e' },
  })
  const { userId: candidateId } = await candidateLogin.json() as { userId: string }
  auditCleanup.trackUser(candidateId)
  const admin = await loginAdmin(browser)
  auditCleanup.trackUser(admin.userId)
  try {
    const add = await admin.page.request.post(`/api/admin/matching/sessions/${session.id}/participants`, {
      data: { userId: candidateId },
    })
    expect(add.status()).toBe(201)
    const participants = await admin.page.request.get(`/api/admin/matching/sessions/${session.id}/participants`)
    const participantPayload = await participants.json() as { data: Array<{ userId: string; joinSource: string; role: string }> }
    expect(participantPayload.data.find((item) => item.userId === candidateId)).toMatchObject({
      joinSource: 'admin', role: 'active',
    })

    await admin.page.goto(`/matching?as=${participantA.userId}`)
    await expect(admin.page.getByTestId('admin-impersonation-banner')).toBeVisible()
    await expect(admin.page.getByTestId('admin-impersonation-banner').getByRole('link')).toHaveAttribute('href', '/admin?tab=matching')
    await admin.page.getByRole('button', { name: 'Изменить размер групп' }).click()
    await admin.page.getByLabel('Минимум участников').fill('2')
    await admin.page.getByLabel('Максимум участников').fill('3')
    const resizeResponse = admin.page.waitForResponse((response) => (
      response.request().method() === 'PATCH' && response.url().endsWith(`/api/matching/sessions/${session.id}`)
    ))
    await admin.page.getByRole('button', { name: 'Сохранить' }).click()
    expect((await resizeResponse).ok()).toBe(true)
    await admin.page.reload()
    await expect(admin.page.getByTestId('matching-header')).toContainText('2–3')
    const sizeEventsResponse = await admin.page.request.get(
      `/api/admin/matching/preference-events?sessionId=${session.id}&eventType=change_group_size`,
    )
    const sizeEvents = await sizeEventsResponse.json() as { events: Array<{
      source: string; actorUserId: string; after: { minGroupSize: number; maxGroupSize: number }
    }> }
    expect(sizeEvents.events).toContainEqual(expect.objectContaining({
      source: 'admin',
      actorUserId: admin.userId,
      after: { minGroupSize: 2, maxGroupSize: 3 },
    }))

    const remove = await admin.page.request.delete(`/api/admin/matching/sessions/${session.id}/participants/${candidateId}`)
    expect(remove.ok()).toBe(true)
    const afterRemove = await admin.page.request.get(`/api/admin/matching/sessions/${session.id}/participants`)
    expect(((await afterRemove.json()) as { data: Array<{ userId: string }> }).data.some((item) => item.userId === candidateId)).toBe(false)

    const provisional = await getState(participantA.page.request, session.id)
    const ownCircle = provisional.scenarios.flatMap((scenario) => scenario.circles).find((circle) => circle.viewerIsMember)
    expect(ownCircle).toBeTruthy()
    await confirm(participantA.page.request, session.id, ownCircle!.circleKey)
    const provisionalRows = await dbExec(
      'select user_id from matching_circle_confirmations where session_id = $1 and user_id = $2',
      [session.id, participantA.userId],
    )
    expect(provisionalRows).toHaveLength(1)
    const freeze = await admin.page.request.post(`/api/matching/sessions/${session.id}/freeze`)
    expect(freeze.ok()).toBe(true)
    const persistedAfterFreeze = await dbExec(
      'select user_id from matching_circle_confirmations where session_id = $1 and user_id = $2',
      [session.id, participantA.userId],
    )
    expect(persistedAfterFreeze).toHaveLength(0)
    await participantA.page.goto('/matching')
    await participantA.page.reload()
    await expect(participantA.page.getByText('● заморожена')).toBeVisible()
    await expect(participantA.page.getByTestId('circle-confirm-button')).toHaveCount(0)
    await expect(participantA.page.getByTestId('circle-cancel-button')).toHaveCount(0)
    await admin.page.goto('/admin?tab=matching')
    const frozenSnapshot = admin.page.getByTestId('admin-frozen-snapshot')
    await expect(frozenSnapshot).toBeVisible()
    await expect(frozenSnapshot).toContainText('Снимок оставшегося сценария')
    await expect(frozenSnapshot).not.toContainText(/подтвержд[её]нн.*круг/i)
  } finally {
    await admin.page.request.delete('/api/test/session', { data: { email: admin.email } }).catch(() => {})
    await admin.context.close()
    await candidate.request.delete('/api/test/session', { data: { email: candidateEmail } }).catch(() => {})
    await candidateContext.close()
  }
})
