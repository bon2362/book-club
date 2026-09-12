import { captureServerEvent } from '@/lib/posthog-server'
import type { MatchingEventDraft, MatchingTransitionActor } from '@/lib/matching/session-transition'

/**
 * Дублирует действия матчинга в PostHog. В нашей базе они и так пишутся в
 * `matching_events`, но там их не видно рядом с остальным путём человека по
 * сайту: как пришёл из каталога, что смотрел, где остановился.
 *
 * Имя события — `matching_<тип>`, например `matching_set_hard`,
 * `matching_self_join`, `matching_book_formed`.
 *
 * PRIVACY: `before`, `after` и `metadata` не отправляются никогда — там снимки
 * имён участников и списки названий книг. Уходят только тип действия,
 * идентификаторы сессии и книги и то, кто совершил действие.
 *
 * Best-effort: сбой отправки не должен влиять на ответ пользователю.
 */
export async function reportMatchingEvents(
  sessionId: string,
  actor: MatchingTransitionActor,
  events: MatchingEventDraft[],
): Promise<void> {
  if (events.length === 0) return
  try {
    await Promise.all(events.map((event) => {
      const personId = event.subjectUserId ?? event.actorUserId ?? null
      const properties: Record<string, unknown> = {
        matching_event_type: event.eventType,
        session_id: sessionId,
        book_id: event.bookId ?? null,
        source: actor.source,
        performed_by: performedBy(event),
        state_version: event.stateVersion,
      }
      if (personId) {
        return captureServerEvent(personId, `matching_${event.eventType}`, properties)
      }
      // Действие без конкретного человека (например, собрался круг книги).
      // Профиль персоны для такого идентификатора не создаём.
      return captureServerEvent(`matching-session:${sessionId}`, `matching_${event.eventType}`, {
        ...properties,
        $process_person_profile: false,
      })
    }))
  } catch (error) {
    console.error('[matching-analytics] reportMatchingEvents failed', error)
  }
}

function performedBy(event: MatchingEventDraft): 'self' | 'other' | 'system' {
  if (!event.actorUserId) return 'system'
  if (event.subjectUserId && event.subjectUserId !== event.actorUserId) return 'other'
  return 'self'
}
