import { buildMatchingEventRows } from '../matching-events'

describe('buildMatchingEventRows', () => {
  it('attaches actor, source, name snapshots, and the transaction version', () => {
    const rows = buildMatchingEventRows({
      sessionId: 's1',
      actor: { userId: 'admin', label: 'Администратор', source: 'admin' },
      namesByUserId: new Map([['u1', 'Анна']]),
      events: [{
        eventType: 'confirmation_created',
        stateVersion: 5,
        subjectUserId: 'u1',
        bookId: 'b1',
        before: null,
        after: { circleKey: 'circle-a' },
      }],
    })

    expect(rows).toEqual([expect.objectContaining({
      sessionId: 's1',
      eventType: 'confirmation_created',
      actorUserId: 'admin',
      actorNameSnapshot: 'Администратор',
      subjectUserId: 'u1',
      subjectNameSnapshot: 'Анна',
      source: 'admin',
      bookId: 'b1',
      stateVersion: 5,
    })])
  })

  it('preserves an explicit automatic actor while retaining the request source', () => {
    const rows = buildMatchingEventRows({
      sessionId: 's1',
      actor: { userId: 'admin', label: 'Администратор', source: 'admin' },
      namesByUserId: new Map(),
      events: [{
        eventType: 'system_event',
        stateVersion: 5,
        actorUserId: null,
      }],
    })

    expect(rows[0]).toEqual(expect.objectContaining({
      actorUserId: null,
      actorNameSnapshot: null,
      source: 'admin',
    }))
  })
})
