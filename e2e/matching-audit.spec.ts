import { test, expect } from './fixtures'
import type { APIRequestContext } from '@playwright/test'
import { epic, feature } from 'allure-js-commons'

type State = {
  session: { stateVersion: number }
  viewer: { ref: string }
  participants: Array<{ ref: string; confirmedCircleKey: string | null }>
  scenarios: Array<{ circles: Array<{
    circleKey: string
    bookId: string
    viewerIsMember: boolean
    members: Array<{ displayName: string }>
  }> }>
}

async function state(request: APIRequestContext, sessionId: string): Promise<State> {
  const response = await request.get(`/api/matching/state?session=${sessionId}`)
  expect(response.ok(), await response.text()).toBe(true)
  return response.json() as Promise<State>
}

async function choose(request: APIRequestContext, sessionId: string, circleKey: string) {
  const current = await state(request, sessionId)
  const response = await request.put(`/api/matching/sessions/${sessionId}/confirmation`, {
    data: { circleKey, expectedStateVersion: current.session.stateVersion },
  })
  expect(response.ok(), await response.text()).toBe(true)
}

test.beforeEach(async () => {
  await epic('Матчинг')
  await feature('Семантическая аналитика и глобальный аудит')
})

test('matching events и audit фиксируют бизнес-изменения, но heartbeat не создаёт шум', async ({
  matchingBoardFixture,
  loginAsAdmin,
  dbExec,
  auditCleanup,
  page,
}) => {
  test.setTimeout(120_000)
  const { session, books, participantA, participantB, addParticipant } = matchingBoardFixture
  const admin = await loginAsAdmin({ name: 'Аудитор E2E' })
  auditCleanup.trackUser(admin.userId)
  const participantC = await addParticipant('Вера E2E', [books[0]])

  const rename = await participantA.page.request.post(`/api/matching/sessions/${session.id}/join`, {
    data: { name: 'Анна Новая E2E' },
  })
  expect(rename.ok()).toBe(true)

  let current = await state(participantA.page.request, session.id)
  const ownCircles = current.scenarios.flatMap((scenario) => scenario.circles).filter((circle) => circle.viewerIsMember)
  const firstBookCircle = ownCircles.find((circle) => (
    circle.bookId === books[0].id && circle.members.some((member) => member.displayName === participantB.name)
  ))
  const secondBookCircle = ownCircles.find((circle) => circle.bookId === books[1].id)
  expect(firstBookCircle).toBeTruthy()
  expect(secondBookCircle).toBeTruthy()

  await choose(participantA.page.request, session.id, firstBookCircle!.circleKey)
  current = await state(participantA.page.request, session.id)
  const cancel = await participantA.page.request.delete(`/api/matching/sessions/${session.id}/confirmation`, {
    data: { expectedStateVersion: current.session.stateVersion },
  })
  expect(cancel.ok()).toBe(true)
  await choose(participantA.page.request, session.id, firstBookCircle!.circleKey)
  await choose(participantA.page.request, session.id, secondBookCircle!.circleKey)
  await choose(participantA.page.request, session.id, firstBookCircle!.circleKey)

  const removeBook = await participantB.page.request.delete(`/api/matching/books/${books[0].id}`)
  expect(removeBook.ok(), await removeBook.text()).toBe(true)
  current = await state(participantA.page.request, session.id)
  const confirmationKey = current.participants.find((item) => item.ref === current.viewer.ref)?.confirmedCircleKey
  expect(confirmationKey).toBeTruthy()
  const transferred = current.scenarios.flatMap((scenario) => scenario.circles)
    .find((circle) => circle.circleKey === confirmationKey)
  expect(transferred?.members.map((member) => member.displayName).sort())
    .toEqual(['Анна Новая E2E', participantC.name].sort())

  await choose(participantC.page.request, session.id, confirmationKey!)
  const lockedResponse = await page.request.get(`/api/admin/matching/sessions/${session.id}/locked-circles`)
  expect(lockedResponse.ok()).toBe(true)
  const lockedPayload = await lockedResponse.json() as { data: Array<{ id: string; status: string }> }
  const locked = lockedPayload.data.find((circle) => circle.status === 'locked')
  expect(locked).toBeTruthy()
  const dissolve = await page.request.post(
    `/api/admin/matching/sessions/${session.id}/circles/${locked!.id}/dissolve`,
    { data: { reason: 'Аварийный возврат для E2E' } },
  )
  expect(dissolve.ok(), await dissolve.text()).toBe(true)
  const freeze = await page.request.post(`/api/matching/sessions/${session.id}/freeze`)
  expect(freeze.ok(), await freeze.text()).toBe(true)

  const analyticsResponse = await page.request.get(
    `/api/admin/matching/preference-events?sessionId=${session.id}&limit=500`,
  )
  expect(analyticsResponse.ok()).toBe(true)
  const analytics = await analyticsResponse.json() as {
    events: Array<{
      eventType: string
      source: string
      actorUserId: string | null
      actorNameSnapshot: string | null
      before: unknown
      after: unknown
      metadata: Record<string, unknown> | null
    }>
  }
  const eventTypes = analytics.events.map((event) => event.eventType)
  expect(eventTypes).toEqual(expect.arrayContaining([
    'self_join', 'welcome_name_changed', 'confirmation_created',
    'confirmation_cancelled', 'confirmation_switched', 'confirmation_transferred',
    'circle_locked', 'circle_dissolved', 'freeze',
  ]))
  const event = (eventType: string, actorUserId: string) => analytics.events.find((item) => (
    item.eventType === eventType && item.actorUserId === actorUserId
  ))
  expect(event('self_join', participantA.userId)).toMatchObject({
    source: 'matching', actorNameSnapshot: participantA.name,
  })
  expect(event('welcome_name_changed', participantA.userId)).toMatchObject({
    source: 'matching',
    before: { name: participantA.name },
    after: { name: 'Анна Новая E2E' },
  })
  expect(event('confirmation_created', participantA.userId)).toMatchObject({
    source: 'matching', before: null,
    after: expect.objectContaining({ circleKey: expect.any(String), memberUserIds: expect.any(Array) }),
  })
  expect(event('confirmation_cancelled', participantA.userId)).toMatchObject({
    source: 'matching',
    before: expect.objectContaining({ circleKey: expect.any(String), memberUserIds: expect.any(Array) }),
    after: null,
  })
  expect(event('confirmation_switched', participantA.userId)).toMatchObject({
    source: 'matching',
    before: expect.objectContaining({ circleKey: expect.any(String) }),
    after: expect.objectContaining({ circleKey: expect.any(String) }),
  })
  expect(event('confirmation_transferred', participantB.userId)).toMatchObject({
    source: 'matching',
    before: expect.objectContaining({ circleKey: expect.any(String), memberUserIds: expect.any(Array) }),
    after: expect.objectContaining({ circleKey: expect.any(String), memberUserIds: expect.any(Array) }),
    metadata: expect.objectContaining({ automatic: true }),
  })
  expect(event('circle_locked', participantC.userId)).toMatchObject({
    source: 'matching',
    after: expect.objectContaining({ circleKey: expect.any(String), memberUserIds: expect.any(Array) }),
    metadata: expect.objectContaining({ automatic: true }),
  })
  const dissolvedEvent = analytics.events.find((event) => event.eventType === 'circle_dissolved')
  expect(dissolvedEvent).toMatchObject({
    source: 'admin',
    actorUserId: admin.userId,
    actorNameSnapshot: 'Аудитор E2E',
    metadata: expect.objectContaining({ reason: 'Аварийный возврат для E2E' }),
  })
  expect(dissolvedEvent?.before).toEqual(expect.objectContaining({
    members: expect.arrayContaining([
      expect.objectContaining({ displayNameSnapshot: 'Анна Новая E2E' }),
      expect.objectContaining({ displayNameSnapshot: participantC.name }),
    ]),
  }))
  expect(event('freeze', admin.userId)).toMatchObject({ source: 'admin' })

  const userAuditResponse = await page.request.get(
    `/api/admin/audit-log?entityType=user&entityId=${participantA.userId}&pageSize=200`,
  )
  expect(userAuditResponse.ok()).toBe(true)
  const userAudit = await userAuditResponse.json() as { events: Array<{
    id: string
    source: string
    actorUserId: string | null
    before: Record<string, unknown> | null
    after: Record<string, unknown> | null
    changedFields: string[]
  }> }
  const renameAudit = userAudit.events.find((event) => event.changedFields.includes('name'))
  expect(renameAudit).toMatchObject({
    source: 'matching', actorUserId: participantA.userId,
    before: expect.objectContaining({ name: participantA.name }),
    after: expect.objectContaining({ name: 'Анна Новая E2E' }),
  })

  const matchingAuditResponse = await page.request.get(
    `/api/admin/audit-log?actorUserId=${admin.userId}&pageSize=200`,
  )
  const matchingAudit = await matchingAuditResponse.json() as { events: Array<{
    id: string
    entityType: string
    source: string
    actorUserId: string | null
    reason: string | null
  }> }
  expect(matchingAudit.events).toEqual(expect.arrayContaining([
    expect.objectContaining({ entityType: 'matching_locked_circles', source: 'admin', actorUserId: admin.userId }),
    expect.objectContaining({ entityType: 'matching_locked_circle_members', source: 'admin', actorUserId: admin.userId }),
    expect.objectContaining({ entityType: 'matching_sessions', source: 'admin', actorUserId: admin.userId }),
  ]))

  type AuditEvent = {
    entityType: string
    action: string
    source: string
    actorUserId: string | null
    before: Record<string, unknown> | null
    after: Record<string, unknown> | null
    changedFields: string[]
  }
  async function actorAudit(actorUserId: string): Promise<AuditEvent[]> {
    const response = await page.request.get(`/api/admin/audit-log?actorUserId=${actorUserId}&pageSize=200`)
    expect(response.ok()).toBe(true)
    return ((await response.json()) as { events: AuditEvent[] }).events
      .filter((row) => row.entityType.startsWith('matching_'))
  }

  const participantAAudit = await actorAudit(participantA.userId)
  const confirmationAudit = participantAAudit.filter((row) => row.entityType === 'matching_circle_confirmations')
  expect(confirmationAudit).toEqual(expect.arrayContaining([
    expect.objectContaining({ action: 'insert', source: 'matching', actorUserId: participantA.userId, before: null, after: expect.objectContaining({ user_id: participantA.userId }) }),
    expect.objectContaining({ action: 'delete', source: 'matching', actorUserId: participantA.userId, before: expect.objectContaining({ user_id: participantA.userId }), after: null }),
    expect.objectContaining({ action: 'update', source: 'matching', actorUserId: participantA.userId, before: expect.objectContaining({ circle_key: expect.any(String) }), after: expect.objectContaining({ circle_key: expect.any(String) }) }),
  ]))

  const participantBAudit = await actorAudit(participantB.userId)
  const transferAudit = participantBAudit.find((row) => (
    row.entityType === 'matching_circle_confirmations' && row.action === 'update' &&
    row.before?.user_id === participantA.userId && row.before?.circle_key !== row.after?.circle_key
  ))
  expect(transferAudit).toMatchObject({ source: 'matching', actorUserId: participantB.userId })
  expect(transferAudit?.before).toEqual(expect.objectContaining({ member_user_ids_json: expect.any(Array) }))
  expect(transferAudit?.after).toEqual(expect.objectContaining({ member_user_ids_json: expect.any(Array) }))

  const participantCAudit = await actorAudit(participantC.userId)
  expect(participantCAudit).toEqual(expect.arrayContaining([
    expect.objectContaining({ entityType: 'matching_locked_circles', action: 'insert', source: 'matching', actorUserId: participantC.userId, before: null, after: expect.objectContaining({ session_id: session.id, book_id: books[0].id }) }),
    expect.objectContaining({ entityType: 'matching_locked_circle_members', action: 'insert', source: 'matching', actorUserId: participantC.userId, before: null, after: expect.objectContaining({ session_id: session.id }) }),
    expect.objectContaining({ entityType: 'matching_circle_confirmations', action: 'delete', source: 'matching', actorUserId: participantC.userId, after: null }),
  ]))
  expect([...participantAAudit, ...participantBAudit, ...participantCAudit].some((row) => row.source === 'trigger')).toBe(false)

  const beforeHeartbeat = await dbExec(
    `select count(*)::int as count from audit_log
     where entity_type = 'matching_session_participants' and entity_id = $1`,
    [`${session.id}:${participantA.userId}`],
  )
  for (let index = 0; index < 3; index++) {
    const heartbeat = await participantA.page.request.get(`/api/matching/version?session=${session.id}`)
    expect(heartbeat.ok()).toBe(true)
  }
  const afterHeartbeat = await dbExec(
    `select count(*)::int as count from audit_log
     where entity_type = 'matching_session_participants' and entity_id = $1`,
    [`${session.id}:${participantA.userId}`],
  )
  expect(afterHeartbeat[0].count).toBe(beforeHeartbeat[0].count)

  expect(analytics.events.some((event) => event.eventType.includes('heartbeat'))).toBe(false)
})
