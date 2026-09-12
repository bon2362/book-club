import type { MatchingBookCircleView, MatchingBookParticipantView } from './matching-book-types'
import { track } from '@/lib/analytics'

function initial(name: string) {
  return name.trim().charAt(0).toLocaleUpperCase('ru') || '•'
}

export default function MatchingBookCircles({
  circles,
  participants,
  viewerRef,
  bookId,
  adminMode = false,
}: {
  circles: MatchingBookCircleView[]
  participants: MatchingBookParticipantView[]
  viewerRef: string
  bookId?: string
  adminMode?: boolean
}) {
  const byRef = new Map(participants.map((participant) => [participant.ref, participant]))
  if (circles.length === 0) return null

  return (
    <div className="nd-mb-circles">
      {circles.map((circle, index) => {
        const mine = circle.memberRefs.includes(viewerRef)
        const calendarVisible = Boolean(bookId) && (mine || adminMode)
        return (
          <section className={`nd-mb-circle${mine ? ' is-mine' : ''}`} key={circle.id} aria-label={`Круг ${index + 1}`}>
            <h4>{circles.length > 1 ? `Круг ${index + 1}` : 'Круг'}{mine ? ' · ваш' : ''}</h4>
            <ul>
              {circle.memberRefs.map((ref) => {
                const participant = byRef.get(ref)
                const displayName = participant?.displayName ?? circle.memberDisplayNames?.[ref]
                if (!displayName) return null
                return (
                  <li key={ref}>
                    <span className="nd-mb-avatar" aria-hidden="true">{initial(displayName)}</span>
                    <span>{ref === viewerRef ? 'Вы' : displayName}</span>
                  </li>
                )
              })}
            </ul>
            {calendarVisible && (
              <a
                href={`/calendar/circle/${bookId}/${circle.position}`}
                className="nd-mb-calendar-link"
                onClick={() => track('matching_calendar_link_clicked', {
                  book_id: bookId ?? null,
                  circle_position: circle.position,
                  is_mine: mine,
                  admin_mode: adminMode,
                })}
              >
                Согласовать время
              </a>
            )}
          </section>
        )
      })}
    </div>
  )
}
