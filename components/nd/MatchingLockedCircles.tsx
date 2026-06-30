'use client'

export interface LockedCircleMember {
  ref: string
  displayName: string
}

export interface LockedCircle {
  circleKey: string
  bookId: string
  lockedAt: string
  members: LockedCircleMember[]
}

export interface MatchingLockedCirclesProps {
  circles: LockedCircle[]
  viewerLockedCircleKey: string | null
  bookTitleById?: Record<string, string>
}

/**
 * Реестр закреплённых кругов над живыми сценариями. Круг наблюдателя выделяется
 * акцентной линией и бейджем «Вы наблюдаете» (Task 8).
 */
export default function MatchingLockedCircles({
  circles,
  viewerLockedCircleKey,
  bookTitleById = {},
}: MatchingLockedCirclesProps) {
  if (circles.length === 0) return null

  return (
    <section data-testid="matching-locked-circles" style={{ display: 'flex', flexDirection: 'column', gap: '0.7rem' }}>
      <h2
        style={{
          margin: 0,
          fontFamily: 'var(--nd-sans)',
          fontSize: '0.6rem',
          letterSpacing: '0.14em',
          textTransform: 'uppercase',
          color: 'var(--text-muted)',
        }}
      >
        Закреплённые круги
      </h2>
      {circles.map((circle) => {
        const isViewer = circle.circleKey === viewerLockedCircleKey
        return (
          <article
            key={circle.circleKey}
            style={{
              borderLeft: `3px solid ${isViewer ? 'var(--accent)' : 'var(--border)'}`,
              borderTop: '1px solid var(--hair)',
              borderRight: '1px solid var(--hair)',
              borderBottom: '1px solid var(--hair)',
              padding: '0.8rem 1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.45rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem' }}>
              <h3
                style={{
                  margin: 0,
                  fontFamily: 'var(--nd-serif), Georgia, serif',
                  fontSize: '1.02rem',
                  fontWeight: 700,
                  color: 'var(--text)',
                }}
              >
                {bookTitleById[circle.bookId] ?? 'Книга круга'}
              </h3>
              {isViewer && (
                <span
                  style={{
                    flexShrink: 0,
                    fontFamily: 'var(--nd-sans)',
                    fontSize: '0.58rem',
                    letterSpacing: '0.12em',
                    textTransform: 'uppercase',
                    fontWeight: 700,
                    color: 'var(--accent)',
                  }}
                >
                  Вы наблюдаете
                </span>
              )}
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: '0.4rem 0.8rem' }}>
              {circle.members.map((member) => (
                <li key={member.ref} style={{ fontSize: '0.85rem', color: 'var(--text-body)' }}>
                  {member.displayName}
                </li>
              ))}
            </ul>
          </article>
        )
      })}
    </section>
  )
}
