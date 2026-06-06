// Pure display helpers for the admin "Аналитика изменений предпочтений" table.
// Kept framework-free so they can be unit-tested without importing the client
// component. Titles are resolved at write time (see lib/matching/mutation-effects.ts),
// so the admin UI needs no id→title map of its own.

export interface PreferenceEventMetadata {
  bookTitle?: string | null
  // Catalog signup delta (resolved titles).
  addedBookTitles?: string[]
  removedBookTitles?: string[]
  // Priorities — ordered by rank (resolved titles).
  rankedBookTitles?: string[]
  status?: string | null
  // participant_left — pseudonym snapshot (the participant row is deleted on leave).
  pseudonym?: string | null
  // Legacy/historical events stored only id arrays — kept for graceful fallback.
  selectedBookIds?: string[]
  bookIds?: string[]
}

export interface PreferenceEventLike {
  eventType: string
  source?: string
  bookId: string | null
  metadata: PreferenceEventMetadata | null
}

export interface ParticipantIdentity {
  name?: string | null
  pseudonym?: string | null
  userId: string
}

// Renders a participant as «Имя (Псевдоним)» with graceful fallbacks:
// name + pseudonym → «Имя (Псевдоним)»; only one → that one; neither → short id.
export function formatParticipant({ name, pseudonym, userId }: ParticipantIdentity): string {
  const trimmedName = name?.trim() || null
  const trimmedPseudonym = pseudonym?.trim() || null
  if (trimmedName && trimmedPseudonym) return `${trimmedName} (${trimmedPseudonym})`
  if (trimmedName) return trimmedName
  if (trimmedPseudonym) return trimmedPseudonym
  return `${userId.slice(0, 12)}…`
}

export function eventTypeLabel(eventType: string): string {
  if (eventType === 'book_added') return 'Добавлена книга'
  if (eventType === 'book_removed') return 'Убрана книга'
  if (eventType === 'rank_changed') return 'Ранги'
  if (eventType === 'status_changed') return 'Статус'
  if (eventType === 'catalog_signup_updated') return 'Изменён набор'
  if (eventType === 'priorities_updated') return 'Приоритеты'
  if (eventType === 'participant_left') return 'Покинул:а сессию'
  return eventType
}

export function sourceLabel(source: string): string {
  if (source === 'matching') return 'Матчинг'
  if (source === 'matching_priority_gate') return 'Предварительный экран приоритетов'
  if (source === 'catalog') return 'Каталог'
  if (source === 'profile') return 'Профиль'
  if (source === 'admin') return 'Админка'
  return source
}

export function eventDetail(event: PreferenceEventLike): string {
  // Lifecycle event without a book: clarify admin removals.
  if (event.eventType === 'participant_left') {
    return event.source === 'admin' ? 'удалён:а админом' : '—'
  }

  const m = event.metadata
  if (m) {
    // Single-book add/remove/status.
    if (m.bookTitle) return m.bookTitle

    // Catalog signup delta: which books were added (+) / removed (−).
    const added = m.addedBookTitles ?? []
    const removed = m.removedBookTitles ?? []
    if (added.length > 0 || removed.length > 0) {
      return [
        ...added.map(title => `+${title}`),
        ...removed.map(title => `−${title}`),
      ].join(', ')
    }

    // Priorities: show the ranking order.
    if (m.rankedBookTitles && m.rankedBookTitles.length > 0) {
      return m.rankedBookTitles.map((title, index) => `${index + 1}. ${title}`).join(' → ')
    }

    // Historical events that stored only id arrays — fall back to a count.
    if (m.selectedBookIds) return `${m.selectedBookIds.length} книг`
    if (m.bookIds) return `${m.bookIds.length} книг`
  }
  return event.bookId ?? '—'
}
