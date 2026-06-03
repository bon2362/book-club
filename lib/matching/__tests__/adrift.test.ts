import {
  clearAdriftCause,
  clearAdriftCausesForSession,
  getAdriftCause,
  rememberAdriftCause,
  rememberAdriftCausesFromEvents,
} from '../adrift'
import type { AdriftCause, LeftoutFeedEventDraft } from '../feed-events'

const cause: AdriftCause = {
  actor: { userId: 'actor', pseudonym: 'Actor' },
  bookId: 'book-a',
  mutationKind: 'book_added',
  leaderBeforeId: 'before',
  leaderAfterId: 'after',
  at: 123,
}

describe('adrift cause storage', () => {
  afterEach(() => {
    clearAdriftCausesForSession('session-a')
    clearAdriftCausesForSession('session-b')
  })

  it('stores and clears a cause per session and user', () => {
    rememberAdriftCause('session-a', 'u1', cause)
    rememberAdriftCause('session-b', 'u1', { ...cause, bookId: 'book-b' })

    expect(getAdriftCause('session-a', 'u1')).toEqual(cause)
    expect(getAdriftCause('session-b', 'u1')?.bookId).toBe('book-b')

    clearAdriftCause('session-a', 'u1')

    expect(getAdriftCause('session-a', 'u1')).toBeNull()
    expect(getAdriftCause('session-b', 'u1')?.bookId).toBe('book-b')
  })

  it('stores causes from leftout feed events', () => {
    const events: LeftoutFeedEventDraft[] = [
      {
        type: 'leftout',
        actor: cause.actor,
        bookId: cause.bookId,
        mutationKind: cause.mutationKind,
        affected: { userId: 'u2', pseudonym: 'User 2' },
        cause,
      },
    ]

    rememberAdriftCausesFromEvents('session-a', events)

    expect(getAdriftCause('session-a', 'u2')).toEqual(cause)
  })
})
