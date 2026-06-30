// Pure display helpers for the admin "Аналитика изменений предпочтений" table.
// Reads from matching_events (new model), kept framework-free for unit testing.

export interface MatchingEventLike {
  eventType: string
  actorUserId: string | null
  actorNameSnapshot: string | null
  subjectUserId: string | null
  subjectNameSnapshot: string | null
  source: string
  bookId: string | null
  before: unknown
  after: unknown
  metadata: Record<string, unknown> | null
}

export function matchingEventTypeLabel(eventType: string): string {
  switch (eventType) {
    case 'self_join': return 'Вход в сессию'
    case 'welcome_name_changed': return 'Имя изменено'
    case 'admin_add': return 'Добавлен:а админом'
    case 'leave': return 'Покинул:а сессию'
    case 'admin_remove': return 'Удалён:а админом'
    case 'confirmation_created': return 'Подтверждение круга'
    case 'confirmation_switched': return 'Смена подтверждения'
    case 'confirmation_cancelled': return 'Отмена подтверждения'
    case 'confirmation_transferred': return 'Перенос подтверждения'
    case 'confirmation_invalidated': return 'Аннулирование подтверждения'
    case 'circle_locked': return 'Круг закреплён'
    case 'circle_dissolved': return 'Круг распущен'
    case 'freeze': return 'Сессия зафиксирована'
    case 'change_book': return 'Изменение книги'
    case 'change_rank': return 'Ранг изменён'
    case 'change_status': return 'Статус чтения изменён'
    case 'replace_signup': return 'Список книг обновлён'
    case 'reorder_priorities': return 'Перестановка приоритетов'
    case 'change_group_size': return 'Изменение размера групп'
    default: return eventType
  }
}

export function matchingSourceLabel(source: string): string {
  switch (source) {
    case 'matching': return 'Матчинг'
    case 'admin': return 'Админка'
    case 'catalog': return 'Каталог'
    case 'profile': return 'Профиль'
    case 'system': return 'Система'
    case 'cron': return 'Автоматически'
    default: return source
  }
}

export function formatMatchingActor(event: MatchingEventLike): string {
  if (!event.actorUserId) return '—'
  if (event.actorNameSnapshot) return event.actorNameSnapshot
  return `${event.actorUserId.slice(0, 12)}…`
}

export function formatMatchingSubject(event: MatchingEventLike): string {
  if (!event.subjectUserId) return '—'
  if (event.subjectNameSnapshot) return event.subjectNameSnapshot
  return `${event.subjectUserId.slice(0, 12)}…`
}

function bookTitle(event: MatchingEventLike): string | null {
  const m = event.metadata
  if (m && typeof m.bookTitle === 'string') return m.bookTitle
  return null
}

function isAutomatic(event: MatchingEventLike): boolean {
  return !!(event.metadata?.automatic)
}

// Returns a human-readable Russian description of the event's detail.
export function formatMatchingEvent(event: MatchingEventLike): string {
  const auto = isAutomatic(event) ? ' (авто)' : ''
  const title = bookTitle(event)

  switch (event.eventType) {
    case 'self_join': {
      const subject = event.subjectNameSnapshot ?? null
      return subject ? `${subject} вошёл:а` : 'вошёл:а в сессию'
    }
    case 'welcome_name_changed': {
      const before = event.before as { name?: unknown } | null
      const after = event.after as { name?: unknown } | null
      return `${typeof before?.name === 'string' ? before.name : '—'} → ${typeof after?.name === 'string' ? after.name : '—'}`
    }
    case 'admin_add': {
      const subject = event.subjectNameSnapshot ?? null
      return subject ? `добавлен:а ${subject}` : 'добавлен:а участник'
    }
    case 'leave': {
      const subject = event.subjectNameSnapshot ?? null
      return subject ? `${subject} покинул:а` : 'покинул:а сессию'
    }
    case 'admin_remove': {
      const subject = event.subjectNameSnapshot ?? null
      return subject ? `удалён:а ${subject}` : 'удалён:а участник'
    }

    case 'confirmation_created':
    case 'confirmation_switched': {
      return title ? `книга: ${title}` : '—'
    }
    case 'confirmation_cancelled': {
      return title ? `отменено для: ${title}` : 'отменено'
    }
    case 'confirmation_transferred': {
      return title ? `перенос на: ${title}${auto}` : `перенос${auto}`
    }
    case 'confirmation_invalidated': {
      return title ? `аннулировано для: ${title}${auto}` : `аннулировано${auto}`
    }

    case 'circle_locked': {
      return title ? `${title}${auto}` : `закреплено${auto}`
    }
    case 'circle_dissolved': {
      const reason = typeof event.metadata?.reason === 'string'
        ? event.metadata.reason
        : null
      const circleKey = typeof event.metadata?.circleKey === 'string' ? event.metadata.circleKey : null
      const members = Array.isArray(event.metadata?.memberDisplayNames)
        ? event.metadata.memberDisplayNames.filter((name): name is string => typeof name === 'string').join(', ')
        : null
      const detail = [title, circleKey, members, reason].filter(Boolean).join(' — ')
      if (detail) return detail
      if (reason) return reason
      if (title) return title
      return 'распущено'
    }

    case 'change_book': {
      const op = event.metadata?.operation
      const sign = op === 'remove' ? '−' : '+'
      return title ? `${sign}${title}` : `${sign}книга`
    }
    case 'change_rank': {
      const after = event.after as Record<string, unknown> | null
      const rank = after?.rank
      const suffix = rank == null ? 'ранг удалён' : `→ #${rank}`
      return title ? `${title}: ${suffix}` : suffix
    }
    case 'change_status': {
      const after = event.after as Record<string, unknown> | null
      const status = after?.status
      const label = status === 'reading'
        ? 'читается сейчас'
        : status === 'read' ? 'прочитана' : 'снова в списке'
      return title ? `${title}: ${label}` : label
    }
    case 'replace_signup': {
      const after = event.after as Record<string, unknown> | null
      const titles = Array.isArray(after?.rankedBookTitles)
        ? (after.rankedBookTitles as string[]).join(', ')
        : null
      return titles || 'список пуст'
    }
    case 'reorder_priorities': {
      const after = event.after as Record<string, unknown> | null
      const titles = Array.isArray(after?.rankedBookTitles)
        ? (after.rankedBookTitles as string[]).map((t, i) => `${i + 1}. ${t}`).join(', ')
        : null
      return titles ?? '—'
    }
    case 'change_group_size': {
      const after = event.after as Record<string, unknown> | null
      if (after && typeof after.minGroupSize === 'number' && typeof after.maxGroupSize === 'number') {
        if (after.minGroupSize === after.maxGroupSize) return `${after.minGroupSize}`
        return `${after.minGroupSize}–${after.maxGroupSize}`
      }
      return '—'
    }

    case 'freeze': {
      return 'сессия зафиксирована'
    }

    default: {
      return title ?? '—'
    }
  }
}
