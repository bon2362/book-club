import type { APIRequestContext } from '@playwright/test'
import { epic, feature } from 'allure-js-commons'
import { test, expect } from './fixtures'

test.describe.configure({ timeout: 120_000 })

type PublicState = { session: { stateVersion: number } }

async function state(request: APIRequestContext, sessionId: string): Promise<PublicState> {
  const response = await request.get(`/api/matching/state?session=${sessionId}`)
  expect(response.ok(), await response.text()).toBe(true)
  return response.json() as Promise<PublicState>
}

async function bookAction(
  request: APIRequestContext,
  sessionId: string,
  action: 'setConditional' | 'setHard',
  bookId: string,
) {
  const current = await state(request, sessionId)
  const response = await request.post(`/api/matching/sessions/${sessionId}/book-actions`, {
    data: { action, bookId, expectedStateVersion: current.session.stateVersion },
  })
  expect(response.ok(), await response.text()).toBe(true)
}

test.beforeEach(async () => {
  await epic('Матчинг')
  await feature('Семантические события и аудит книжной модели')
})

test('книжные назначения и lifecycle аудируются, а heartbeat не создаёт шум @matching-golden', async ({
  matchingBooksFixture,
  dbExec,
}) => {
  const { session, books, participantA, admin, getParticipantB, getParticipantC } = matchingBooksFixture
  const [participantB, participantC] = await Promise.all([getParticipantB(), getParticipantC()])

  await bookAction(participantB.request, session.id, 'setConditional', books[0].id)
  await bookAction(participantA.request, session.id, 'setHard', books[0].id)
  await bookAction(participantC.request, session.id, 'setHard', books[0].id)

  let current = await state(admin.request, session.id)
  const close = await admin.request.post(`/api/admin/matching/sessions/${session.id}/book-admin-actions`, {
    data: { action: 'closeSession', expectedStateVersion: current.session.stateVersion },
  })
  expect(close.ok(), await close.text()).toBe(true)
  current = await state(admin.request, session.id)
  const reopen = await admin.request.post(`/api/admin/matching/sessions/${session.id}/book-admin-actions`, {
    data: { action: 'reopenSession', expectedStateVersion: current.session.stateVersion },
  })
  expect(reopen.ok(), await reopen.text()).toBe(true)

  const eventRows = await dbExec(
    `select event_type, source, actor_user_id
     from matching_events
     where session_id = $1`,
    [session.id],
  ) as Array<{ event_type: string; source: string; actor_user_id: string | null }>
  expect(eventRows.map((row) => row.event_type)).toEqual(expect.arrayContaining([
    'conditional_set', 'hard_set', 'book_formed', 'session_closed', 'session_open',
  ]))
  expect(eventRows).toContainEqual(expect.objectContaining({
    event_type: 'session_closed', source: 'admin', actor_user_id: admin.userId,
  }))

  const auditRows = await dbExec(
    `select entity_type, source, actor_user_id
     from audit_log
     where actor_user_id = any($1::text[])
       and entity_type like 'matching_%'`,
    [[participantA.userId, participantB.userId, participantC.userId, admin.userId]],
  )
  expect(auditRows.map((row) => row.entity_type)).toEqual(expect.arrayContaining([
    'matching_book_intents',
    'matching_book_assignments',
    'matching_circles',
    'matching_sessions',
  ]))
  expect(auditRows.some((row) => row.source === 'trigger')).toBe(false)

  const beforeHeartbeat = await dbExec(
    `select count(*)::int as count from audit_log
     where entity_type = 'matching_session_participants' and entity_id = $1`,
    [`${session.id}:${participantA.userId}`],
  )
  for (let index = 0; index < 3; index++) {
    const heartbeat = await participantA.request.get(`/api/matching/version?session=${session.id}`)
    expect(heartbeat.ok()).toBe(true)
  }
  const afterHeartbeat = await dbExec(
    `select count(*)::int as count from audit_log
     where entity_type = 'matching_session_participants' and entity_id = $1`,
    [`${session.id}:${participantA.userId}`],
  )
  expect(afterHeartbeat[0].count).toBe(beforeHeartbeat[0].count)
  expect(eventRows.some((row) => row.event_type.includes('heartbeat'))).toBe(false)
})
