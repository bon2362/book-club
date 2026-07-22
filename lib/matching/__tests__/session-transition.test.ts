import {
  MatchingTransitionError,
  executeMatchingTransition,
  resolveParticipantRole,
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
  session: { status: string; stateVersion: number; bookModeInitializedAt?: Date | null } = {
    status: 'active', stateVersion: 4,
  }
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
  actionApplied = false
  beforeDisplayNames = new Map([['u1', 'Анна'], ['u2', 'Иван'], ['u3', 'Иван (2)']])
  afterDisplayNames = this.beforeDisplayNames

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
    this.calls.push(`getDisplayNames:${this.actionApplied ? 'post' : 'pre'}`)
    return this.actionApplied ? this.afterDisplayNames : this.beforeDisplayNames
  }

  async hasLatestConfirmationOutcome(input: {
    userId: string
    afterStateVersion: number
    throughStateVersion: number
    participantRole: 'active' | 'observer'
    outcome: string
    circleKey?: string
  }) {
    const latest = Array.from(this.confirmationOutcomes)
      .map((value) => {
        const [version, outcome, circleKey] = value.split(':')
        return { version: Number(version), outcome, circleKey }
      })
      .filter(({ version }) => version > input.afterStateVersion && version <= input.throughStateVersion)
      .sort((a, b) => b.version - a.version)[0]
    if (!latest || latest.outcome !== input.outcome || latest.circleKey !== (input.circleKey ?? '')) return false
    const current = this.confirmations.find((item) => item.userId === input.userId)?.circleKey ?? null
    return input.outcome === 'cancel'
      ? input.participantRole === 'active' && current === null
      : current === input.circleKey || (current === null && input.participantRole === 'observer')
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

  async applyAction(_sessionId: string, action: MatchingAction, _nextStateVersion: number, context: { sessionStatus: string }) {
    this.calls.push(`applyAction:${action.type}`)
    this.calls.push(`applyActionContext:${context.sessionStatus}`)
    this.actionApplied = true
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
    store.roles.set('u1', 'observer')

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

  it('recognizes a confirmation retry after unrelated actions advanced the session', async () => {
    const store = new MemoryTransitionStore()
    store.session.stateVersion = 6
    store.confirmations = [confirmation('u1', 'circle-a')]
    store.confirmationOutcomes.add('5:set:circle-a')

    await expect(executeMatchingTransition({
      sessionId: 's1', actor, expectedStateVersion: 4,
      action: { type: 'set_confirmation', userId: 'u1', circleKey: 'circle-a' },
    }, store)).resolves.toEqual({ changed: false, stateVersion: 6 })
  })

  it('recognizes a cancellation retry after unrelated actions advanced the session', async () => {
    const store = new MemoryTransitionStore()
    store.session.stateVersion = 6
    store.confirmationOutcomes.add('5:cancel:')

    await expect(executeMatchingTransition({
      sessionId: 's1', actor, expectedStateVersion: 4,
      action: { type: 'cancel_confirmation', userId: 'u1' },
    }, store)).resolves.toEqual({ changed: false, stateVersion: 6 })
  })

  it('does not report a historical confirmation as idempotent after the participant left', async () => {
    const store = new MemoryTransitionStore()
    store.session.stateVersion = 6
    store.confirmationOutcomes.add('5:set:circle-a')
    store.roles.set('u1', 'missing')

    await expect(executeMatchingTransition({
      sessionId: 's1', actor, expectedStateVersion: 4,
      action: { type: 'set_confirmation', userId: 'u1', circleKey: 'circle-a' },
    }, store)).rejects.toMatchObject({ code: 'stale_state' })
  })

  it.each(['leave', 'admin_remove'])('does not report a historical cancellation as idempotent after %s', async () => {
    const store = new MemoryTransitionStore()
    store.session.stateVersion = 6
    store.confirmationOutcomes.add('5:cancel:')
    store.roles.set('u1', 'missing')

    await expect(executeMatchingTransition({
      sessionId: 's1', actor, expectedStateVersion: 4,
      action: { type: 'cancel_confirmation', userId: 'u1' },
    }, store)).rejects.toMatchObject({ code: 'stale_state' })
  })

  it.each([
    {
      name: 'a later cancellation superseded the original confirmation',
      outcomes: ['5:set:circle-a', '6:cancel:'],
      confirmations: [],
      action: { type: 'set_confirmation', userId: 'u1', circleKey: 'circle-a' } as const,
    },
    {
      name: 'a later different choice superseded the original confirmation',
      outcomes: ['5:set:circle-a', '6:set:circle-b'],
      confirmations: [confirmation('u1', 'circle-b')],
      action: { type: 'set_confirmation', userId: 'u1', circleKey: 'circle-a' } as const,
    },
    {
      name: 'a later confirmation superseded the original cancellation',
      outcomes: ['5:cancel:', '6:set:circle-a'],
      confirmations: [confirmation('u1', 'circle-a')],
      action: { type: 'cancel_confirmation', userId: 'u1' } as const,
    },
  ])('rejects a stale retry when $name', async ({ outcomes, confirmations, action }) => {
    const store = new MemoryTransitionStore()
    store.session.stateVersion = 6
    store.confirmations = confirmations
    outcomes.forEach((outcome) => store.confirmationOutcomes.add(outcome))

    await expect(executeMatchingTransition({
      sessionId: 's1', actor, expectedStateVersion: 4, action,
    }, store)).rejects.toMatchObject({ code: 'stale_state' })
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
      notices: [{
        userId: 'u1',
        kind: 'circle_dissolved',
        payload: { bookId: 'b1', memberDisplayNames: ['Анна'], reason: 'по просьбе' },
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
    expect(store.notices).toContainEqual(expect.objectContaining({
      userId: 'u1', kind: 'circle_dissolved',
      payload: expect.objectContaining({ reason: 'по просьбе', memberDisplayNames: ['Анна'] }),
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

  it('uses post-join names for the destination while preserving pre-action source names', async () => {
    const store = new MemoryTransitionStore()
    store.beforeDisplayNames = new Map([['u1', 'Анна'], ['u2', 'Иван']])
    store.afterDisplayNames = new Map([['u1', 'Анна'], ['u2', 'Иван'], ['u4', 'Вера']])
    store.confirmations = [{
      userId: 'u1', bookId: 'b1', circleKey: 'old', memberUserIds: ['u1', 'u2'],
    }]
    store.scenarios = [{ circles: [circle('new', ['u1', 'u4'])] }]

    await executeMatchingTransition({
      sessionId: 's1', actor,
      action: { type: 'self_join', userId: 'u4', name: 'Вера' },
    }, store)

    expect(store.notices[0].payload).toEqual(expect.objectContaining({
      fromMemberDisplayNames: ['Анна', 'Иван'],
      toMemberDisplayNames: ['Анна', 'Вера'],
    }))
    expect(store.calls.indexOf('getDisplayNames:pre')).toBeLessThan(store.calls.indexOf('applyAction:self_join'))
    expect(store.calls.indexOf('applyAction:self_join')).toBeLessThan(store.calls.indexOf('getDisplayNames:post'))
  })

  it('keeps pre-rename names for invalidated confirmation snapshots', async () => {
    const store = new MemoryTransitionStore()
    store.beforeDisplayNames = new Map([['u1', 'Анна'], ['u2', 'Иван']])
    store.afterDisplayNames = new Map([['u1', 'Анна'], ['u2', 'Игорь']])
    store.confirmations = [{
      userId: 'u1', bookId: 'b1', circleKey: 'gone', memberUserIds: ['u1', 'u2'],
    }]
    store.scenarios = []

    await executeMatchingTransition({
      sessionId: 's1', actor,
      action: { type: 'self_join', userId: 'u2', name: 'Игорь' },
    }, store)

    expect(store.notices[0].payload).toEqual(expect.objectContaining({
      memberDisplayNames: ['Анна', 'Иван'],
    }))
    expect(store.calls).toEqual(expect.arrayContaining([
      'getDisplayNames:pre', 'applyAction:self_join', 'getDisplayNames:post',
    ]))
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

  it('runs canonical book actions without legacy scenario reconciliation', async () => {
    const store = new MemoryTransitionStore()
    store.session = { status: 'open', stateVersion: 4, bookModeInitializedAt: new Date() }

    await expect(executeMatchingTransition({
      sessionId: 's1', actor, expectedStateVersion: 4,
      action: { type: 'set_conditional', userId: 'u1', bookId: 'b1' },
    }, store)).resolves.toEqual({ changed: true, stateVersion: 5 })

    expect(store.calls).toContain('applyAction:set_conditional')
    expect(store.calls).not.toContain('getRankedScenarios')
    expect(store.calls).toContain('bumpStateVersion')
  })

  it('allows common membership actions after cutover but blocks participant actions when closed', async () => {
    const openStore = new MemoryTransitionStore()
    openStore.session = { status: 'open', stateVersion: 4, bookModeInitializedAt: new Date() }
    await expect(executeMatchingTransition({
      sessionId: 's1', actor, expectedStateVersion: 4,
      action: { type: 'self_join', userId: 'u1' },
    }, openStore)).resolves.toEqual({ changed: true, stateVersion: 5 })
    expect(openStore.calls).not.toContain('getRankedScenarios')

    const closedStore = new MemoryTransitionStore()
    closedStore.session = { status: 'closed', stateVersion: 4, bookModeInitializedAt: new Date() }
    await expect(executeMatchingTransition({
      sessionId: 's1', actor, expectedStateVersion: 4,
      action: { type: 'set_hard', userId: 'u1', bookId: 'b1' },
    }, closedStore)).rejects.toMatchObject({ code: 'session_frozen' })

    await expect(executeMatchingTransition({
      sessionId: 's1', actor, expectedStateVersion: 4,
      action: { type: 'change_book', userId: 'u1', bookId: 'b1', operation: 'remove' },
    }, closedStore)).resolves.toEqual({ changed: true, stateVersion: 4 })
    expect(closedStore.calls).toContain('applyActionContext:closed')
    expect(closedStore.calls).not.toContain('bumpStateVersion')
  })

  it.each([
    ['closed', { type: 'change_book', userId: 'u1', bookId: 'b1', operation: 'remove' } as const],
    ['closed', { type: 'change_rank', userId: 'u1', bookId: 'b1', rank: 2 } as const],
    ['closed', { type: 'change_status', userId: 'u1', bookId: 'b1', status: 'reading' } as const],
    ['frozen', { type: 'change_book', userId: 'u1', bookId: 'b1', operation: 'remove' } as const],
    ['frozen', { type: 'change_rank', userId: 'u1', bookId: 'b1', rank: 2 } as const],
    ['frozen', { type: 'change_status', userId: 'u1', bookId: 'b1', status: 'reading' } as const],
  ])('allows %s historical $type without changing matching history/version', async (status, action) => {
    const store = new MemoryTransitionStore()
    store.session = { status, stateVersion: 4, bookModeInitializedAt: null }
    store.events.push({ eventType: 'historical_event', stateVersion: 3 })
    store.notices.push({ userId: 'u1', kind: 'historical_notice' })

    await expect(executeMatchingTransition({
      sessionId: 's1', actor, expectedStateVersion: 4,
      action,
    }, store)).resolves.toEqual({ changed: true, stateVersion: 4 })

    expect(store.calls).toContain(`applyAction:${action.type}`)
    expect(store.calls).toContain(`applyActionContext:${status}`)
    expect(store.calls).not.toContain('getRankedScenarios')
    expect(store.calls).not.toContain('writeEvents')
    expect(store.calls).not.toContain('writeNotices')
    expect(store.calls).not.toContain('bumpStateVersion')
    expect(store.events).toEqual([{ eventType: 'historical_event', stateVersion: 3 }])
    expect(store.notices).toEqual([{ userId: 'u1', kind: 'historical_notice' }])
  })

  it.each(['closed', 'frozen'])('allows %s observer to change historical personal status', async (status) => {
    const store = new MemoryTransitionStore()
    store.session = { status, stateVersion: 4, bookModeInitializedAt: null }
    store.roles.set('u1', 'observer')

    await expect(executeMatchingTransition({
      sessionId: 's1', actor, expectedStateVersion: 4,
      action: { type: 'change_status', userId: 'u1', bookId: 'b1', status: 'reading' },
    }, store)).resolves.toEqual({ changed: true, stateVersion: 4 })

    expect(store.calls).not.toContain('getParticipantRole:u1')
    expect(store.calls).toContain('applyAction:change_status')
  })

  it('keeps observer lock for personal status changes in an open session', async () => {
    const store = new MemoryTransitionStore()
    store.session = { status: 'open', stateVersion: 4, bookModeInitializedAt: new Date() }
    store.roles.set('u1', 'observer')

    await expect(executeMatchingTransition({
      sessionId: 's1', actor, expectedStateVersion: 4,
      action: { type: 'change_status', userId: 'u1', bookId: 'b1', status: 'reading' },
    }, store)).rejects.toMatchObject({ code: 'participant_locked' })

    expect(store.calls).toContain('getParticipantRole:u1')
    expect(store.calls).not.toContain('applyAction:change_status')
  })

  it('does not extend historical bypass to replace_signup', async () => {
    const store = new MemoryTransitionStore()
    store.session = { status: 'closed', stateVersion: 4, bookModeInitializedAt: new Date() }

    await expect(executeMatchingTransition({
      sessionId: 's1', actor, expectedStateVersion: 4,
      action: { type: 'replace_signup', userId: 'u1', name: 'Анна', contacts: '@anna', bookIds: ['b1'] },
    }, store)).rejects.toMatchObject({ code: 'session_frozen' })
    expect(store.calls).not.toContain('applyAction:replace_signup')
  })

  it('allows book choices and leaving after a legacy-imported participant is canonically unassigned', async () => {
    for (const action of [
      { type: 'set_conditional', userId: 'u1', bookId: 'b1' } as const,
      { type: 'set_hard', userId: 'u1', bookId: 'b1' } as const,
      { type: 'leave', userId: 'u1' } as const,
    ]) {
      const store = new MemoryTransitionStore()
      store.session = { status: 'open', stateVersion: 4, bookModeInitializedAt: new Date() }
      store.roles.set('u1', resolveParticipantRole({
        bookModeInitialized: true, hasBookAssignment: false, hasLegacyLock: true,
      }))
      await expect(executeMatchingTransition({
        sessionId: 's1', actor, expectedStateVersion: 4, action,
      }, store)).resolves.toEqual({ changed: true, stateVersion: 5 })
    }
  })

  it('initializes once and keeps no-op admin commands from bumping version', async () => {
    const store = new MemoryTransitionStore()
    await expect(executeMatchingTransition({
      sessionId: 's1', actor, expectedStateVersion: 4,
      action: { type: 'initialize_book_mode' },
    }, store)).resolves.toEqual({ changed: true, stateVersion: 5 })
    expect(store.calls).not.toContain('getRankedScenarios')

    const initialized = new MemoryTransitionStore()
    initialized.session = { status: 'open', stateVersion: 4, bookModeInitializedAt: new Date() }
    await expect(executeMatchingTransition({
      sessionId: 's1', actor, expectedStateVersion: 4,
      action: { type: 'initialize_book_mode' },
    }, initialized)).resolves.toEqual({ changed: false, stateVersion: 4 })
    expect(initialized.calls).not.toContain('bumpStateVersion')

    initialized.applyResult = false
    await expect(executeMatchingTransition({
      sessionId: 's1', actor, expectedStateVersion: 4,
      action: { type: 'admin_place_book_assignment', userId: 'u1', circleId: null },
    }, initialized)).resolves.toEqual({ changed: false, stateVersion: 4 })
    expect(initialized.calls).not.toContain('bumpStateVersion')
  })

  it('persists formation and auto-assignment outcomes emitted during legacy initialization', async () => {
    const store = new MemoryTransitionStore()
    store.applyResult = {
      changed: true,
      events: [
        { eventType: 'legacy_circle_imported', bookId: 'b1' },
        { eventType: 'legacy_confirmation_imported', subjectUserId: 'u4', bookId: 'b2' },
        { eventType: 'book_formed', bookId: 'b2', after: { assignedUserIds: ['u4', 'u5', 'u6'] } },
        { eventType: 'participant_auto_assigned', subjectUserId: 'u4', bookId: 'b2' },
        { eventType: 'book_mode_initialized' },
      ],
    }
    await expect(executeMatchingTransition({
      sessionId: 's1', actor, expectedStateVersion: 4, action: { type: 'initialize_book_mode' },
    }, store)).resolves.toEqual({ changed: true, stateVersion: 5 })
    expect(store.events.map(event => event.eventType)).toEqual([
      'legacy_circle_imported', 'legacy_confirmation_imported', 'book_formed',
      'participant_auto_assigned', 'book_mode_initialized',
    ])
    expect(store.events.every(event => event.stateVersion === 5)).toBe(true)
  })
})

describe('resolveParticipantRole', () => {
  it('ignores a legacy lock after cutover once canonical assignment is removed', () => {
    expect(resolveParticipantRole({
      bookModeInitialized: true,
      hasBookAssignment: false,
      hasLegacyLock: true,
    })).toBe('active')
  })

  it('uses canonical assignment after cutover and legacy lock before it', () => {
    expect(resolveParticipantRole({ bookModeInitialized: true, hasBookAssignment: true, hasLegacyLock: false })).toBe('observer')
    expect(resolveParticipantRole({ bookModeInitialized: false, hasBookAssignment: false, hasLegacyLock: true })).toBe('observer')
  })
})
