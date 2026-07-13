import type { APIRequestContext, Browser, BrowserContext, Page } from '@playwright/test'
import { epic, feature } from 'allure-js-commons'
import { test, expect } from './fixtures'

type AdminIdentity = {
  context: BrowserContext
  page: Page
  email: string
  userId: string
}

async function createAdmin(browser: Browser): Promise<AdminIdentity> {
  const context = await browser.newContext()
  const page = await context.newPage()
  const email = `e2e-book-cutover-admin-${Date.now()}-${Math.random().toString(36).slice(2)}@test.invalid`
  const response = await page.request.post('/api/test/session', {
    data: { email, name: 'Администратор Cutover E2E', isAdmin: true, telegramUsername: `cutover_${Date.now()}` },
  })
  expect(response.ok(), await response.text()).toBe(true)
  const { userId } = await response.json() as { userId: string }
  return { context, page, email, userId }
}

async function version(request: APIRequestContext, sessionId: string, viewerUserId: string) {
  const response = await request.get(`/api/matching/state?session=${sessionId}&as=${viewerUserId}`)
  expect(response.ok(), await response.text()).toBe(true)
  return ((await response.json()) as { session: { stateVersion: number } }).session.stateVersion
}

async function adminAction(
  admin: AdminIdentity,
  sessionId: string,
  viewerUserId: string,
  data: Record<string, unknown>,
) {
  const expectedStateVersion = await version(admin.page.request, sessionId, viewerUserId)
  return admin.page.request.post(`/api/admin/matching/sessions/${sessionId}/book-admin-actions`, {
    data: { ...data, expectedStateVersion },
  })
}

test.beforeEach(async () => {
  await epic('Матчинг')
  await feature('Live cutover в книжный режим')
})

test('cutover импортирует exact locked circle, оставшиеся confirmations и только один раз ставит marker/version', async ({
  matchingBoardFixture,
  browser,
  dbExec,
  auditCleanup,
}) => {
  const { session, books, participantA, participantB, addParticipant } = matchingBoardFixture
  const participantC = await addParticipant('Вера Cutover E2E')
  const participantD = await addParticipant('Глеб Cutover E2E')
  const participantE = await addParticipant('Дарья Cutover E2E')
  const admin = await createAdmin(browser)
  auditCleanup.trackUser(admin.userId)
  const legacyCircleId = `__e2e_legacy_circle_${Date.now()}_${Math.random().toString(36).slice(2)}__`
  const lockedMembers = [participantA, participantB]
  const remainingConfirmations = [participantC, participantD, participantE]

  try {
    const beforeRows = await dbExec(
      'select state_version as "stateVersion", book_mode_initialized_at as "marker" from matching_sessions where id = $1',
      [session.id],
    )
    const beforeVersion = Number(beforeRows[0].stateVersion)
    expect(beforeRows[0].marker).toBeNull()

    await dbExec(
      `insert into matching_locked_circles
        (id, session_id, book_id, circle_key, status, locked_at, locked_state_version)
       values ($1, $2, $3, $4, 'locked', now(), $5)`,
      [legacyCircleId, session.id, books[0].id, `legacy:${legacyCircleId}`, beforeVersion],
    )
    for (const member of lockedMembers) {
      await dbExec(
        `insert into matching_locked_circle_members
          (circle_id, session_id, user_id, display_name_snapshot)
         values ($1, $2, $3, $4)`,
        [legacyCircleId, session.id, member.userId, member.name],
      )
    }
    // A's overlapping confirmation must lose to the already locked assignment.
    for (const participant of [participantA, ...remainingConfirmations]) {
      await dbExec(
        `insert into matching_circle_confirmations
          (session_id, user_id, book_id, circle_key, member_user_ids_json)
         values ($1, $2, $3, $4, $5::jsonb)`,
        [session.id, participant.userId, books[1].id, `remaining:${participant.userId}`, JSON.stringify(remainingConfirmations.map(item => item.userId))],
      )
    }

    const initialize = await admin.page.request.post(
      `/api/admin/matching/sessions/${session.id}/book-admin-actions`,
      { data: { action: 'initializeBookMode', expectedStateVersion: beforeVersion } },
    )
    expect(initialize.ok(), await initialize.text()).toBe(true)

    const sessionAfter = await dbExec(
      `select status, state_version as "stateVersion", book_mode_initialized_at as "marker"
       from matching_sessions where id = $1`,
      [session.id],
    )
    expect(sessionAfter[0]).toMatchObject({ status: 'open', stateVersion: beforeVersion + 1 })
    expect(sessionAfter[0].marker).not.toBeNull()
    const marker = String(sessionAfter[0].marker)

    const assignments = await dbExec(
      `select user_id as "userId", book_id as "bookId", source, circle_id as "circleId"
       from matching_book_assignments where session_id = $1 order by user_id`,
      [session.id],
    )
    expect(assignments).toHaveLength(5)
    for (const member of lockedMembers) {
      expect(assignments).toContainEqual(expect.objectContaining({
        userId: member.userId,
        bookId: books[0].id,
        source: 'legacy',
      }))
    }
    for (const participant of remainingConfirmations) {
      expect(assignments).toContainEqual(expect.objectContaining({
        userId: participant.userId,
        bookId: books[1].id,
        source: 'hard',
      }))
    }
    expect(assignments.filter(row => row.userId === participantA.userId)).toHaveLength(1)

    const importedCircle = await dbExec(
      `select id, legacy_locked_circle_id as "legacyId"
       from matching_circles where session_id = $1 and book_id = $2`,
      [session.id, books[0].id],
    )
    expect(importedCircle).toHaveLength(1)
    expect(importedCircle[0].legacyId).toBe(legacyCircleId)
    expect(assignments.filter(row => lockedMembers.some(member => member.userId === row.userId)).map(row => row.circleId))
      .toEqual([importedCircle[0].id, importedCircle[0].id])

    const formedBooks = await dbExec(
      'select book_id as "bookId" from matching_session_book_states where session_id = $1 order by book_id',
      [session.id],
    )
    expect(formedBooks.map(row => row.bookId).sort()).toEqual([books[0].id, books[1].id].sort())

    const initializeAgain = await admin.page.request.post(
      `/api/admin/matching/sessions/${session.id}/book-admin-actions`,
      { data: { action: 'initializeBookMode', expectedStateVersion: beforeVersion + 1 } },
    )
    expect(initializeAgain.ok(), await initializeAgain.text()).toBe(true)
    expect(await initializeAgain.json()).toMatchObject({ changed: false, stateVersion: beforeVersion + 1 })
    const sessionTwice = await dbExec(
      `select state_version as "stateVersion", book_mode_initialized_at as "marker"
       from matching_sessions where id = $1`,
      [session.id],
    )
    expect(sessionTwice[0]).toMatchObject({ stateVersion: beforeVersion + 1 })
    expect(String(sessionTwice[0].marker)).toBe(marker)
    const initializationEvents = await dbExec(
      `select count(*)::int as count from matching_events
       where session_id = $1 and event_type = 'book_mode_initialized'`,
      [session.id],
    )
    expect(initializationEvents[0].count).toBe(1)

    // Imported participants are no longer pinned to legacy observer state once
    // the canonical assignment is removed.
    const unassign = await adminAction(admin, session.id, participantA.userId, {
      action: 'unassign', userId: participantA.userId,
    })
    expect(unassign.ok(), await unassign.text()).toBe(true)
    let participantVersion = await version(participantA.page.request, session.id, participantA.userId)
    const setHard = await participantA.page.request.post(`/api/matching/sessions/${session.id}/book-actions`, {
      data: { action: 'setHard', bookId: books[0].id, expectedStateVersion: participantVersion },
    })
    expect(setHard.ok(), await setHard.text()).toBe(true)
    const unassignAgain = await adminAction(admin, session.id, participantA.userId, {
      action: 'unassign', userId: participantA.userId,
    })
    expect(unassignAgain.ok(), await unassignAgain.text()).toBe(true)
    participantVersion = await version(participantA.page.request, session.id, participantA.userId)
    const leave = await participantA.page.request.delete(`/api/matching/sessions/${session.id}/leave`, {
      data: { expectedStateVersion: participantVersion },
    })
    expect(leave.ok(), await leave.text()).toBe(true)
    await participantA.page.goto('/matching')
    await participantA.page.reload()
    await expect(participantA.page.getByTestId('welcome-join-button')).toBeVisible()
  } finally {
    await admin.page.request.delete('/api/test/session', { data: { email: admin.email } }).catch(() => {})
    await admin.context.close()
  }
})

test('invalid legacy preflight rolls back canonical rows, marker and state version', async ({
  matchingBoardFixture,
  browser,
  dbExec,
  auditCleanup,
}) => {
  const { session, books } = matchingBoardFixture
  const admin = await createAdmin(browser)
  auditCleanup.trackUser(admin.userId)
  const invalidCircleId = `__e2e_invalid_legacy_${Date.now()}_${Math.random().toString(36).slice(2)}__`

  try {
    const before = await dbExec(
      'select state_version as "stateVersion" from matching_sessions where id = $1',
      [session.id],
    )
    const beforeVersion = Number(before[0].stateVersion)
    await dbExec(
      `insert into matching_locked_circles
        (id, session_id, book_id, circle_key, status, locked_at, locked_state_version)
       values ($1, $2, $3, $4, 'locked', now(), $5)`,
      [invalidCircleId, session.id, books[0].id, `invalid:${invalidCircleId}`, beforeVersion],
    )
    // Admin exists as a user but is intentionally not a session participant.
    await dbExec(
      `insert into matching_locked_circle_members
        (circle_id, session_id, user_id, display_name_snapshot)
       values ($1, $2, $3, $4)`,
      [invalidCircleId, session.id, admin.userId, 'Не участник'],
    )

    const initialize = await admin.page.request.post(
      `/api/admin/matching/sessions/${session.id}/book-admin-actions`,
      { data: { action: 'initializeBookMode', expectedStateVersion: beforeVersion } },
    )
    expect(initialize.status()).toBe(409)

    const after = await dbExec(
      `select status, state_version as "stateVersion", book_mode_initialized_at as "marker"
       from matching_sessions where id = $1`,
      [session.id],
    )
    expect(after[0]).toMatchObject({ status: 'active', stateVersion: beforeVersion, marker: null })
    for (const table of ['matching_book_assignments', 'matching_book_intents', 'matching_session_book_states', 'matching_circles']) {
      const rows = await dbExec(`select count(*)::int as count from ${table} where session_id = $1`, [session.id])
      expect(rows[0].count, `${table} must stay empty after rollback`).toBe(0)
    }
  } finally {
    await admin.page.request.delete('/api/test/session', { data: { email: admin.email } }).catch(() => {})
    await admin.context.close()
  }
})
