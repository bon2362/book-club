import type { MatchingBookParticipantStatus, MatchingBookParticipantView } from './matching-book-types'

const LABELS: Record<MatchingBookParticipantStatus, string> = {
  interest: 'держат в списке',
  conditional: 'готовы читать',
  hard: 'выбрали окончательно',
  assigned: 'в круге',
}

const ORDER: MatchingBookParticipantStatus[] = ['assigned', 'hard', 'conditional']

function initial(name: string) {
  return name.trim().charAt(0).toLocaleUpperCase('ru') || '•'
}

export function participantStatusLabel(status: MatchingBookParticipantStatus) {
  if (status === 'interest') return 'пока только в списке'
  if (status === 'conditional') return 'готов:а читать'
  if (status === 'hard') return 'уже записал:ась'
  return 'в круге'
}

export default function MatchingBookParticipants({
  participants,
}: {
  participants: MatchingBookParticipantView[]
}) {
  const determined = participants.filter((participant) => participant.status !== 'interest')
  if (determined.length === 0) return null

  return (
    <div className="nd-mb-participant-tiers" aria-label="Определившиеся участники">
      {ORDER.map((status) => {
        const people = determined.filter((participant) => participant.status === status)
        if (people.length === 0) return null
        const shown = people.slice(0, 6)
        return (
          <div className={`nd-mb-tier is-${status}`} key={status}>
            <span className="nd-mb-avatar-stack" aria-hidden="true">
              {shown.map((participant) => (
                <span className="nd-mb-avatar" key={participant.ref} title={participant.displayName}>
                  {initial(participant.displayName)}
                </span>
              ))}
              {people.length > shown.length && <span className="nd-mb-avatar">+{people.length - shown.length}</span>}
            </span>
            <span><strong>{people.length}</strong> {LABELS[status]}</span>
            <span className="sr-only">: {people.map((person) => person.displayName).join(', ')}</span>
          </div>
        )
      })}
    </div>
  )
}
