import { test, expect } from '../../api-fixtures'

test('cutover imports locked and confirmed participants once with stable marker/version', async ({ matchingApiFixture, dbExec }) => {
  const { session, books, participantA, participantB, admin, addParticipant } = matchingApiFixture
  const [participantC, participantD, participantE] = await Promise.all([
    addParticipant('Вера API E2E'),
    addParticipant('Глеб API E2E'),
    addParticipant('Дарья API E2E'),
  ])
  const remainingConfirmations = [participantC, participantD, participantE]
  const circleId = `__e2e_legacy_circle_${Date.now()}_${Math.random().toString(36).slice(2)}__`
  const beforeRows = await dbExec(
    'select state_version as "stateVersion" from matching_sessions where id = $1',
    [session.id],
  )
  const beforeVersion = Number(beforeRows[0].stateVersion)
  await dbExec(
    `insert into matching_locked_circles
      (id, session_id, book_id, circle_key, status, locked_at, locked_state_version)
     values ($1, $2, $3, $4, 'locked', now(), $5)`,
    [circleId, session.id, books[0].id, `legacy:${circleId}`, beforeVersion],
  )
  for (const participant of [participantA, participantB]) {
    await dbExec(
      `insert into matching_locked_circle_members
        (circle_id, session_id, user_id, display_name_snapshot)
       values ($1, $2, $3, $4)`,
      [circleId, session.id, participant.userId, participant.name],
    )
  }
  for (const participant of [participantA, ...remainingConfirmations]) {
    await dbExec(
      `insert into matching_circle_confirmations
        (session_id, user_id, book_id, circle_key, member_user_ids_json)
       values ($1, $2, $3, $4, $5::jsonb)`,
      [
        session.id,
        participant.userId,
        books[1].id,
        `remaining:${participant.userId}`,
        JSON.stringify(remainingConfirmations.map(item => item.userId)),
      ],
    )
  }

  const initialize = await admin.request.post(
    `/api/admin/matching/sessions/${session.id}/book-admin-actions`,
    { data: { action: 'initializeBookMode', expectedStateVersion: beforeVersion } },
  )
  expect(initialize.ok(), await initialize.text()).toBe(true)
  const after = await dbExec(
    `select state_version as "stateVersion", book_mode_initialized_at as marker
     from matching_sessions where id = $1`,
    [session.id],
  )
  expect(after[0].stateVersion).toBe(beforeVersion + 1)
  expect(after[0].marker).not.toBeNull()
  const assignments = await dbExec(
    `select user_id as "userId", book_id as "bookId", source
     from matching_book_assignments where session_id = $1`,
    [session.id],
  )
  expect(assignments).toEqual(expect.arrayContaining([
    expect.objectContaining({ userId: participantA.userId, bookId: books[0].id, source: 'legacy' }),
    expect.objectContaining({ userId: participantB.userId, bookId: books[0].id, source: 'legacy' }),
    ...remainingConfirmations.map(participant => expect.objectContaining({
      userId: participant.userId,
      bookId: books[1].id,
      source: 'hard',
    })),
  ]))
  expect(assignments.filter(row => row.userId === participantA.userId)).toHaveLength(1)

  const initializeAgain = await admin.request.post(
    `/api/admin/matching/sessions/${session.id}/book-admin-actions`,
    { data: { action: 'initializeBookMode', expectedStateVersion: beforeVersion + 1 } },
  )
  expect(initializeAgain.ok(), await initializeAgain.text()).toBe(true)
  expect(await initializeAgain.json()).toMatchObject({ changed: false, stateVersion: beforeVersion + 1 })
})

test('invalid cutover preflight rolls back rows, marker, and state version', async ({ matchingApiFixture, dbExec }) => {
  const { session, books, admin } = matchingApiFixture
  const invalidCircleId = `__e2e_invalid_legacy_${Date.now()}_${Math.random().toString(36).slice(2)}__`
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
  await dbExec(
    `insert into matching_locked_circle_members
      (circle_id, session_id, user_id, display_name_snapshot)
     values ($1, $2, $3, $4)`,
    [invalidCircleId, session.id, admin.userId, 'Не участник'],
  )

  const initialize = await admin.request.post(
    `/api/admin/matching/sessions/${session.id}/book-admin-actions`,
    { data: { action: 'initializeBookMode', expectedStateVersion: beforeVersion } },
  )
  expect(initialize.status()).toBe(409)

  const after = await dbExec(
    `select status, state_version as "stateVersion", book_mode_initialized_at as marker
     from matching_sessions where id = $1`,
    [session.id],
  )
  expect(after[0]).toMatchObject({ status: 'active', stateVersion: beforeVersion, marker: null })
  for (const table of ['matching_book_assignments', 'matching_book_intents', 'matching_session_book_states', 'matching_circles']) {
    const rows = await dbExec(`select count(*)::int as count from ${table} where session_id = $1`, [session.id])
    expect(rows[0].count, `${table} must stay empty after rollback`).toBe(0)
  }
})

test('book-mode state stays available when a legacy shortlist row has no rank', async ({ matchingApiFixture, dbExec }) => {
  const { session, books, participantA, admin } = matchingApiFixture
  const stateBefore = await admin.request.get(`/api/matching/state?session=${session.id}&as=${participantA.userId}`)
  const before = await stateBefore.json() as { session: { stateVersion: number } }
  const initialize = await admin.request.post(`/api/admin/matching/sessions/${session.id}/book-admin-actions`, {
    data: { action: 'initializeBookMode', expectedStateVersion: before.session.stateVersion },
  })
  expect(initialize.ok(), await initialize.text()).toBe(true)
  await dbExec('delete from book_priorities where user_id = $1 and book_id = $2', [participantA.userId, books[0].id])

  const response = await participantA.request.get(`/api/matching/state?session=${session.id}`)
  expect(response.ok(), await response.text()).toBe(true)
  const state = await response.json() as { bookMode: null | { books: Array<{ bookId: string }> } }
  expect(state.bookMode).not.toBeNull()
  expect(state.bookMode?.books.some(book => book.bookId === books[0].id)).toBe(true)
})
