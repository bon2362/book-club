'use client'

import type { AdriftCause } from '@/lib/matching/feed-events'

interface Props {
  reason: 'change' | 'never'
  cause: (AdriftCause & { bookTitle?: string | null }) | null
  onFix: () => void
}

function relativeTime(ts: number): string {
  const delta = Math.max(0, Date.now() - ts)
  const minutes = Math.max(1, Math.round(delta / 60_000))
  if (minutes < 60) return `${minutes} мин назад`
  const hours = Math.round(minutes / 60)
  return `${hours} ч назад`
}

function actionLabel(kind: AdriftCause['mutationKind']): string {
  if (kind === 'book_removed') return 'убрал:а'
  if (kind === 'book_added') return 'добавил:а'
  if (kind === 'status_changed') return 'изменил:а статус'
  return 'изменил:а список'
}

export default function MatchingAdriftBanner({ reason, cause, onFix }: Props) {
  return (
    <section
      data-testid="matching-adrift-banner"
      style={{
        background: 'var(--bg-input)',
        border: '1px solid var(--border)',
        borderLeft: '3px solid var(--status-warn)',
        padding: '0.95rem 1.1rem',
        marginBottom: '0.9rem',
      }}
    >
      <div
        style={{
          fontSize: '0.62rem',
          textTransform: 'uppercase',
          letterSpacing: '0.14em',
          color: 'var(--status-warn)',
          fontWeight: 700,
        }}
      >
        Вы за бортом
      </div>
      <p style={{ margin: '0.35rem 0 0', color: 'var(--text-body)', fontSize: '0.86rem', lineHeight: 1.45 }}>
        {reason === 'change'
          ? 'В лучшем сейчас сценарии для вас не собирается читательский круг — вы не попадаете ни в одну группу.'
          : 'Пока ни одна из ваших книг не собрала круг — вы не входите ни в одну группу ни в одном сценарии. Так бывает в начале сессии, пока совпадений ещё мало.'}
      </p>
      {reason === 'change' && cause && (
        <p style={{ margin: '0.55rem 0 0', color: 'var(--text-secondary)', fontSize: '0.78rem', lineHeight: 1.45 }}>
          Вы выпали из круга после того, как{' '}
          <strong style={{ color: 'var(--text)' }}>{cause.actor.pseudonym}</strong>{' '}
          {actionLabel(cause.mutationKind)}
          {cause.bookTitle ? <> «{cause.bookTitle}»</> : null} · {relativeTime(cause.at)}
        </p>
      )}
      <button
        type="button"
        onClick={onFix}
        style={{
          marginTop: '0.75rem',
          padding: 0,
          border: 'none',
          background: 'transparent',
          color: 'var(--accent)',
          fontSize: '0.74rem',
          fontWeight: 700,
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          cursor: 'pointer',
        }}
      >
        Как вернуться в круг →
      </button>
    </section>
  )
}
