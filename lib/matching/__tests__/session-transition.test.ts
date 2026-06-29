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
  events: Array<{ eventType: string; stateVersion: number }> = []
  notices: Array<{ userId: string; kind: string }> = []
  locked: ReconciliationCircle[] = []
  failEvents = false

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
    return true
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

  async writeNotices(_sessionId: string, notices: Array<{ userId: string; kind: string }>) {
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
