import {
  MatchingTransitionError,
  executeMatchingTransition,
  type MatchingAction,
  type MatchingTransitionStore,
} from '../session-transition'
import type {
  CircleConfirmation,
  RankedReconciliationScenario,
  ReconciliationCircle,
} from '../confirmation-reconciliation'

function circle(key: string, members = ['u1', 'u2', 'u3']): ReconciliationCircle {
  return { circleKey: key, bookId: 'b1', memberUserIds: members }
}

function confirmation(userId: string, key: string): CircleConfirmation {
  return { userId, bookId: 'b1', circleKey: key, memberUserIds: ['u1', 'u2', 'u3'] }
}

class MemoryTransitionStore implements MatchingTransitionStore {
  session = { status: 'active', stateVersion: 4 }
  roles = new Map<string, 'missing' | 'active' | 'observer'>([
    ['u1', 'active'],
    ['u2', 'active'],
    ['u3', 'active'],
  ])
  scenarios: RankedReconciliationScenario[] = [{ circles: [circle('circle-a')] }]
  confirmations: CircleConfirmation[] = []
  calls: string[] = []
  events: Array<{
    eventType: string
    stateVersion: number
    bookId?: string | null
    before?: unknown
    after?: unknown
    metadata?: Record<string, unknown>
  }> = []
  notices: Array<{ userId: string; kind: string; payload?: Record<string, unknown> }> = []
  locked: ReconciliationCircle[] = []
  failEvents = false
  confirmationOutcomes = new Set<string>()
  applyResult: Awaited<ReturnType<MatchingTransitionStore['applyAction']>> = true

  async lockSession() {
    this.calls.push('lockSession')
    return this.session
  }

  async getParticipantRole(_sessionId: string, userId: string) {
    this.calls.push(`getParticipantRole:${userId}`)
    return this.roles.get(userId) ?? 'missing'
  }

  async getRankedScenarios() {
    this.calls.push('getRankedScenarios')
    return this.scenarios
  }

  async getConfirmations() {
    this.calls.push('getConfirmations')
    return [...this.confirmations]
  }

  async getDisplayNames() {
    return new Map([['u1', 'Анна'], ['u2', 'Иван'], ['u3', 'Иван (2)']])
  }

  async hasConfirmationOutcome(input: { stateVersion: number; outcome: string; circleKey?: string }) {
    return this.confirmationOutcomes.has(`${input.stateVersion}:${input.outcome}:${input.circleKey ?? ''}`)
  }

  async upsertConfirmation(_sessionId: string, value: CircleConfirmation) {
    this.calls.push(`upsertConfirmation:${value.circleKey}`)
    this.confirmations = this.confirmations.filter((item) => item.userId !== value.userId)
    this.confirmations.push(value)
  }

  async deleteConfirmation(_sessionId: string, userId: string) {
    this.calls.push(`deleteConfirmation:${userId}`)
    const before = this.confirmations.length
    this.confirmations = this.confirmations.filter((item) => item.userId !== userId)
    return this.confirmations.length !== before
  }

  async applyAction(_sessionId: string, action: MatchingAction) {
    this.calls.push(`applyAction:${action.type}`)
    return this.applyResult
  }

  async lockCircle(_sessionId: string, value: ReconciliationCircle) {
    this.calls.push(`lockCircle:${value.circleKey}`)
    this.locked.push(value)
    const members = new Set(value.memberUserIds)
    this.confirmations = this.confirmations.filter((item) => !members.has(item.userId))
    value.memberUserIds.forEach((userId) => this.roles.set(userId, 'observer'))
    this.scenarios = []
  }

  async writeEvents(_sessionId: string, events: Array<{ eventType: string; stateVersion: number }>) {
    this.calls.push('writeEvents')
    if (this.failEvents) throw new Error('event write failed')
    this.events.push(...events)
  }

  async writeNotices(_sessionId: string, notices: Array<{ userId: string; kind: string; payload?: Record<string, unknown> }>) {
    this.calls.push('writeNotices')
    this.notices.push(...notices)
  }

  async bumpStateVersion() {
    this.calls.push('bumpStateVersion')
    this.session = { ...this.session, stateVersion: this.session.stateVersion + 1 }
  }
}

const actor = { userId: 'u1', label: 'Анна', source: 'matching' }

describe('executeMatchingTransition', () => {
  it('atomically replaces an old confirmation and bumps version after events', async () => {
    const store = new MemoryTransitionStore()
    store.confirmations = [confirmation('u1', 'circle-old')]

    const result = await executeMatchingTransition({
      sessionId: 's1',
      actor,
      expectedStateVersion: 4,
      action: { type: 'set_confirmation', userId: 'u1', circleKey: 'circle-a' },
    }, store)

    expect(store.confirmations).toEqual([confirmation('u1', 'circle-a')])
    expect(result).toEqual({ changed: true, stateVersion: 5 })
    expect(store.calls.indexOf('writeEvents')).toBeLessThan(store.calls.indexOf('bumpStateVersion'))
    expect(store.calls).not.toContain('deleteConfirmation:u1')
  })

  it('treats a repeated identical confirmation as idempotent', async () => {
    const store = new MemoryTransitionStore()
    store.confirmations = [confirmation('u1', 'circle-a')]

    const result = await executeMatchingTransition({
      sessionId: 's1',
      actor,
      expectedStateVersion: 4,
      action: { type: 'set_confirmation', userId: 'u1', circleKey: 'circle-a' },
    }, store)

    expect(result).toEqual({ changed: false, stateVersion: 4 })
    expect(store.events).toEqual([])
    expect(store.calls).not.toContain('bumpStateVersion')
  })

  it('treats a lost-response retry of the committed confirmation as idempotent', async () => {
    const store = new MemoryTransitionStore()
    store.session.stateVersion = 5
    store.confirmations = [confirmation('u1', 'circle-a')]
    store.confirmationOutcomes.add('5:set:circle-a')

    await expect(executeMatchingTransition({
      sessionId: 's1', actor, expectedStateVersion: 4,
      action: { type: 'set_confirmation', userId: 'u1', circleKey: 'circle-a' },
    }, store)).resolves.toEqual({ changed: false, stateVersion: 5 })
  })

  it('keeps a stale confirmation retry for another circle rejected', async () => {
    const store = new MemoryTransitionStore()
    store.session.stateVersion = 5
    store.confirmations = [confirmation('u1', 'circle-a')]

    await expect(executeMatchingTransition({
      sessionId: 's1', actor, expectedStateVersion: 4,
      action: { type: 'set_confirmation', userId: 'u1', circleKey: 'circle-b' },
    }, store)).rejects.toMatchObject({ code: 'stale_state' })
  })

  it('recognizes a committed confirmation retry after reconciliation locked its circle', async () => {
    const store = new MemoryTransitionStore()
    store.session.stateVersion = 5
    store.confirmationOutcomes.add('5:set:circle-a')

    await expect(executeMatchingTransition({
      sessionId: 's1', actor, expectedStateVersion: 4,
      action: { type: 'set_confirmation', userId: 'u1', circleKey: 'circle-a' },
    }, store)).resolves.toEqual({ changed: false, stateVersion: 5 })
  })

  it('treats a lost-response retry of a committed cancellation as idempotent', async () => {
    const store = new MemoryTransitionStore()
    store.session.stateVersion = 5
    store.confirmationOutcomes.add('5:cancel:')

    await expect(executeMatchingTransition({
      sessionId: 's1', actor, expectedStateVersion: 4,
      action: { type: 'cancel_confirmation', userId: 'u1' },
    }, store)).resolves.toEqual({ changed: false, stateVersion: 5 })
  })

  it('locks a full quorum and continues reconciliation after removing its members', async () => {
    const store = new MemoryTransitionStore()
    store.confirmations = [
      confirmation('u1', 'circle-a'),
      confirmation('u2', 'circle-a'),
    ]

    await executeMatchingTransition({
      sessionId: 's1',
      actor: { ...actor, userId: 'u3' },
      expectedStateVersion: 4,
      action: { type: 'set_confirmation', userId: 'u3', circleKey: 'circle-a' },
    }, store)

    expect(store.locked).toEqual([circle('circle-a')])
    expect(store.confirmations).toEqual([])
    expect(store.events.map((event) => event.eventType)).toEqual([
      'confirmation_created',
      'circle_locked',
    ])
  })

  it('routes a generic scenario-changing action through applyAction and bumps version once', async () => {
    const store = new MemoryTransitionStore()

    const result = await executeMatchingTransition({
      sessionId: 's1',
      actor,
      expectedStateVersion: 4,
      action: { type: 'reorder_priorities', userId: 'u1', bookIds: ['b1', 'b2'] },
    }, store)

    expect(result).toEqual({ changed: true, stateVersion: 5 })
    expect(store.calls).toContain('applyAction:reorder_priorities')
    expect(store.events.map((event) => event.eventType)).toEqual(['reorder_priorities'])
    expect(store.calls.filter((call) => call === 'bumpStateVersion')).toHaveLength(1)
  })

  it('records enough detail to explain preference changes in matching analytics', async () => {
    const store = new MemoryTransitionStore()

    await executeMatchingTransition({
      sessionId: 's1',
      actor,
      action: { type: 'change_status', userId: 'u1', bookId: 'b1', status: 'reading' },
    }, store)

    expect(store.events).toEqual([
      expect.objectContaining({
        eventType: 'change_status',
        bookId: 'b1',
        after: { status: 'reading' },
      }),
    ])
  })

  it('keeps welcome name changes separate from self-join analytics', async () => {
    const store = new MemoryTransitionStore()
    store.applyResult = {
      changed: true,
      events: [
        { eventType: 'self_join', subjectUserId: 'u1' },
        {
          eventType: 'welcome_name_changed', subjectUserId: 'u1',
          before: { name: 'Анна' }, after: { name: 'Аня' },
        },
      ],
    }

    await executeMatchingTransition({
      sessionId: 's1', actor,
      action: { type: 'self_join', userId: 'u1', name: 'Аня' },
    }, store)

    expect(store.events).toEqual([
      expect.objectContaining({ eventType: 'self_join' }),
      expect.objectContaining({
        eventType: 'welcome_name_changed',
        before: { name: 'Анна' }, after: { name: 'Аня' },
      }),
    ])
  })

  it('preserves exact dissolved-circle snapshots in the semantic event', async () => {
    const store = new MemoryTransitionStore()
    store.applyResult = {
      changed: true,
      events: [{
        eventType: 'circle_dissolved', bookId: 'b1',
        before: { circleKey: 'circle-a', members: [{ userId: 'u1', displayNameSnapshot: 'Анна' }] },
        after: { status: 'dissolved' },
        metadata: { circleKey: 'circle-a', reason: 'по просьбе', memberDisplayNames: ['Анна'] },
      }],
    }

    await executeMatchingTransition({
      sessionId: 's1', actor,
      action: { type: 'dissolve_circle', circleId: 'lc1', reason: 'по просьбе' },
    }, store)

    expect(store.events[0]).toEqual(expect.objectContaining({
      eventType: 'circle_dissolved', bookId: 'b1',
      before: { circleKey: 'circle-a', members: [{ userId: 'u1', displayNameSnapshot: 'Анна' }] },
      metadata: expect.objectContaining({ circleKey: 'circle-a', reason: 'по просьбе' }),
    }))
  })

  it('stores stable duplicate-name snapshots in transfer notices', async () => {
    const store = new MemoryTransitionStore()
    store.confirmations = [{
      userId: 'u1', bookId: 'b1', circleKey: 'old', memberUserIds: ['u1', 'u2', 'u3'],
    }]
    store.scenarios = [{ circles: [circle('new', ['u1', 'u2'])] }]

    await executeMatchingTransition({
      sessionId: 's1', actor,
      action: { type: 'leave', userId: 'u3' },
    }, store)

    expect(store.notices).toContainEqual(expect.objectContaining({
      kind: 'confirmation_transferred',
      payload: expect.objectContaining({
        fromMemberDisplayNames: ['Анна', 'Иван', 'Иван (2)'],
        toMemberDisplayNames: ['Анна', 'Иван'],
      }),
    }))
  })

  it('allows global profile preferences to change for an observer without returning them to calculations', async () => {
    const store = new MemoryTransitionStore()
    store.roles.set('u1', 'observer')

    await expect(executeMatchingTransition({
      sessionId: 's1',
      actor,
      action: {
        type: 'replace_signup',
        userId: 'u1',
        name: 'Анна',
        contacts: '@anna',
        bookIds: ['b1'],
      },
    }, store)).resolves.toEqual({ changed: true, stateVersion: 5 })

    expect(store.roles.get('u1')).toBe('observer')
    expect(store.events).toEqual([
      expect.objectContaining({
        eventType: 'replace_signup',
        after: { bookIds: ['b1'], name: 'Анна' },
      }),
    ])
  })

  it('rejects stale, frozen, and observer actions before mutation', async () => {
    const staleStore = new MemoryTransitionStore()
    await expect(executeMatchingTransition({
      sessionId: 's1', actor, expectedStateVersion: 3,
      action: { type: 'cancel_confirmation', userId: 'u1' },
    }, staleStore)).rejects.toMatchObject({ code: 'stale_state' })

    const frozenStore = new MemoryTransitionStore()
    frozenStore.session.status = 'frozen'
    await expect(executeMatchingTransition({
      sessionId: 's1', actor, expectedStateVersion: 4,
      action: { type: 'cancel_confirmation', userId: 'u1' },
    }, frozenStore)).rejects.toMatchObject({ code: 'session_frozen' })

    const observerStore = new MemoryTransitionStore()
    observerStore.roles.set('u1', 'observer')
    await expect(executeMatchingTransition({
      sessionId: 's1', actor, expectedStateVersion: 4,
      action: { type: 'cancel_confirmation', userId: 'u1' },
    }, observerStore)).rejects.toMatchObject({ code: 'participant_locked' })
  })

  it('does not bump version when writing semantic events fails', async () => {
    const store = new MemoryTransitionStore()
    store.failEvents = true

    await expect(executeMatchingTransition({
      sessionId: 's1', actor, expectedStateVersion: 4,
      action: { type: 'set_confirmation', userId: 'u1', circleKey: 'circle-a' },
    }, store)).rejects.toThrow('event write failed')

    expect(store.calls).not.toContain('bumpStateVersion')
  })

  it('returns typed transition errors', () => {
    expect(new MatchingTransitionError('circle_not_found').code).toBe('circle_not_found')
  })
})
