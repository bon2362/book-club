import {
  executeMatchingTransition,
  MatchingTransitionError,
  type MatchingTransitionStore,
} from '../session-transition'

function makeStore(overrides: Partial<MatchingTransitionStore> = {}): MatchingTransitionStore {
  return {
    lockSession: jest.fn().mockResolvedValue({ status: 'open', stateVersion: 4 }),
    getParticipantRole: jest.fn().mockResolvedValue('active'),
    applyAction: jest.fn().mockResolvedValue(true),
    writeEvents: jest.fn().mockResolvedValue(undefined),
    writeNotices: jest.fn().mockResolvedValue(undefined),
    bumpStateVersion: jest.fn().mockResolvedValue(undefined),
    ...overrides,
  }
}

const actor = { userId: 'user-1', label: 'Анна', source: 'matching' }

test('allows participant actions while a pre-migration session is active', async () => {
  const store = makeStore({
    lockSession: jest.fn().mockResolvedValue({ status: 'active', stateVersion: 4 }),
  })

  await expect(executeMatchingTransition({
    sessionId: 'session-1', actor,
    action: { type: 'set_conditional', userId: 'user-1', bookId: 'book-1' },
  }, store)).resolves.toEqual({ changed: true, stateVersion: 5 })
})

test('treats a pre-migration frozen session as closed', async () => {
  const store = makeStore({
    lockSession: jest.fn().mockResolvedValue({ status: 'frozen', stateVersion: 4 }),
  })

  await expect(executeMatchingTransition({
    sessionId: 'session-1', actor,
    action: { type: 'set_conditional', userId: 'user-1', bookId: 'book-1' },
  }, store)).rejects.toEqual(expect.objectContaining<Partial<MatchingTransitionError>>({ code: 'session_closed' }))
})

test('rejects ordinary participant mutations after the session is closed', async () => {
  const store = makeStore({
    lockSession: jest.fn().mockResolvedValue({ status: 'closed', stateVersion: 4 }),
  })

  await expect(executeMatchingTransition({
    sessionId: 'session-1', actor, action: { type: 'set_hard', userId: 'user-1', bookId: 'book-1' },
  }, store)).rejects.toEqual(expect.objectContaining<Partial<MatchingTransitionError>>({ code: 'session_closed' }))
  expect(store.applyAction).not.toHaveBeenCalled()
})

test('allows historical catalog cleanup in a closed session without changing its state version', async () => {
  const store = makeStore({
    lockSession: jest.fn().mockResolvedValue({ status: 'closed', stateVersion: 4 }),
  })

  await expect(executeMatchingTransition({
    sessionId: 'session-1', actor,
    action: { type: 'change_status', userId: 'user-1', bookId: 'book-1', status: 'read' },
  }, store)).resolves.toEqual({ changed: true, stateVersion: 4 })
  expect(store.getParticipantRole).not.toHaveBeenCalled()
  expect(store.bumpStateVersion).not.toHaveBeenCalled()
})

test('checks optimistic state version before applying an action', async () => {
  const store = makeStore()

  await expect(executeMatchingTransition({
    sessionId: 'session-1', actor, expectedStateVersion: 3,
    action: { type: 'set_hard', userId: 'user-1', bookId: 'book-1' },
  }, store)).rejects.toEqual(expect.objectContaining<Partial<MatchingTransitionError>>({ code: 'stale_state' }))
  expect(store.applyAction).not.toHaveBeenCalled()
})

test('rejects actions from observers without running scenario reconciliation', async () => {
  const store = makeStore({ getParticipantRole: jest.fn().mockResolvedValue('observer') })

  await expect(executeMatchingTransition({
    sessionId: 'session-1', actor,
    action: { type: 'change_book', userId: 'user-1', bookId: 'book-1', operation: 'add' },
  }, store)).rejects.toEqual(expect.objectContaining<Partial<MatchingTransitionError>>({ code: 'participant_locked' }))
  expect(store.applyAction).not.toHaveBeenCalled()
})

test('writes action events and notices and bumps the version once', async () => {
  const store = makeStore({
    applyAction: jest.fn().mockResolvedValue({
      changed: true,
      events: [{ eventType: 'book_formed', bookId: 'book-1' }],
      notices: [{ userId: 'user-1', kind: 'circle_locked' }],
    }),
  })

  await expect(executeMatchingTransition({
    sessionId: 'session-1', actor, expectedStateVersion: 4,
    action: { type: 'set_hard', userId: 'user-1', bookId: 'book-1' },
  }, store)).resolves.toEqual({ changed: true, stateVersion: 5 })
  expect(store.writeEvents).toHaveBeenCalledWith('session-1', [{
    eventType: 'book_formed', bookId: 'book-1', stateVersion: 5,
  }])
  expect(store.writeNotices).toHaveBeenCalledWith('session-1', [{ userId: 'user-1', kind: 'circle_locked' }])
  expect(store.bumpStateVersion).toHaveBeenCalledTimes(1)
})
