'use client'

import type { AdriftCause } from '@/lib/matching/feed-events'
import type { OptimizationMode } from '@/lib/matching/scenarios'
import { pseudonymPastVerb } from '@/lib/matching/pseudonym-declension'

interface Props {
  reason: 'change' | 'never'
  cause: (AdriftCause & { bookTitle?: string | null }) | null
  onFix: () => void
  onDismiss?: () => void
  viewingUserId?: string
  mode?: OptimizationMode
}

function relativeTime(ts: number): string {
  const delta = Math.max(0, Date.now() - ts)
  const minutes = Math.max(1, Math.round(delta / 60_000))
  if (minutes < 60) return `${minutes} мин назад`
  const hours = Math.round(minutes / 60)
  return `${hours} ч назад`
}

function actionVerb(kind: AdriftCause['mutationKind'], isViewer: boolean, pseudonym: string): string {
  if (isViewer) {
    if (kind === 'book_removed') return 'убрали'
    if (kind === 'book_added') return 'добавили'
    if (kind === 'status_changed') return 'изменили статус'
    return 'изменили список'
  }
  // Род согласуется с псевдонимом-животным, без гендергепов «убрал:а».
  if (kind === 'book_removed') return pseudonymPastVerb(pseudonym, { m: 'убрал', f: 'убрала', n: 'убрало' })
  if (kind === 'book_added') return pseudonymPastVerb(pseudonym, { m: 'добавил', f: 'добавила', n: 'добавило' })
  if (kind === 'status_changed') return pseudonymPastVerb(pseudonym, { m: 'изменил статус', f: 'изменила статус', n: 'изменило статус' })
  return pseudonymPastVerb(pseudonym, { m: 'изменил список', f: 'изменила список', n: 'изменило список' })
}

export default function MatchingAdriftBanner({ reason, cause, onFix, onDismiss, viewingUserId, mode = 'coverage' }: Props) {
  const isActorViewer = !!viewingUserId && cause?.actor.userId === viewingUserId
  const actorLabel = isActorViewer ? 'вы' : (cause?.actor.pseudonym ?? '')
  const soft = mode === 'satisfaction'

  return (
    <>
      <style>{`
        .nd-adrift-cta { transition: background 0.12s ease; }
        .nd-adrift-cta:hover { background: ${soft ? 'var(--accent-hover)' : 'color-mix(in srgb, var(--status-warn) 80%, black)'} !important; }
      `}</style>

      <section
        data-testid="matching-adrift-banner"
        style={{
          background: soft ? 'var(--bg-input)' : 'var(--status-warn-soft)',
          border: soft ? '1px solid var(--hair)' : '1px solid color-mix(in srgb, var(--status-warn) 30%, transparent)',
          borderLeft: `3px solid ${soft ? 'var(--accent)' : 'var(--status-warn)'}`,
          borderRadius: 'var(--radius-card)',
          padding: '1rem 1.15rem',
          boxShadow: 'var(--shadow-card)',
          display: 'flex',
          gap: '0.95rem',
          alignItems: 'flex-start',
          marginBottom: '0.9rem',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: soft ? 22 : undefined,
            height: soft ? 22 : undefined,
            borderRadius: soft ? 'var(--radius)' : undefined,
            border: soft ? '1px solid var(--accent)' : undefined,
            fontFamily: soft ? 'var(--nd-serif)' : undefined,
            fontSize: soft ? '0.95rem' : '1.4rem',
            color: soft ? 'var(--accent)' : 'var(--status-warn)',
            flexShrink: 0,
            lineHeight: soft ? '22px' : 1,
            marginTop: '0.18rem',
            textAlign: 'center',
            fontWeight: soft ? 700 : undefined,
          }}
        >
          {soft ? 'i' : '⚠'}
        </span>

        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            {/* Text block */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <h2
                style={{
                  margin: 0,
                  fontFamily: 'var(--nd-serif)',
                  fontSize: '1.22rem',
                  fontWeight: 700,
                  color: 'var(--text)',
                  letterSpacing: '-0.01em',
                }}
              >
                {soft ? 'Вы пока не в круге' : 'Вы за бортом'}
              </h2>

              <p style={{ margin: '0.3rem 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5, maxWidth: '64ch' }}>
                {soft
                  ? 'Читательские круги собираются по самому близкому совпадению интересов — и не все попадают сразу. Это нормально: посмотрите, что выбирают другие, можете добавить книги или дождаться других участников.'
                  : reason === 'change'
                    ? 'В лучшем сейчас сценарии для вас не собирается читательский круг — вы не попадаете ни в одну группу.'
                    : 'Пока ни одна из ваших книг не собрала круг — вы не входите ни в одну группу ни в одном сценарии. Так бывает в начале сессии, пока совпадений ещё мало.'}
              </p>
              {soft && (
                <p style={{ margin: '0.45rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                  Ваши приоритеты учтены — вы в подборе. Просто пока не нашлось круга с вашими книгами.
                </p>
              )}

              {reason === 'change' && cause && (
                <p
                  style={{
                    margin: '0.55rem 0 0',
                    fontSize: '0.83rem',
                    color: 'var(--text-secondary)',
                    lineHeight: 1.45,
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.45rem',
                    flexWrap: 'wrap',
                  }}
                >
                  <span>
                    Вы выпали из круга после того, как{' '}
                    <strong style={{ color: 'var(--text)' }}>{actorLabel}</strong>{' '}
                    {actionVerb(cause.mutationKind, isActorViewer, cause.actor.pseudonym)}
                    {cause.bookTitle ? (
                      <> «<span style={{ fontFamily: 'var(--nd-serif)', fontWeight: 700 }}>{cause.bookTitle}</span>»</>
                    ) : null}
                    {' '}· {relativeTime(cause.at)}
                  </span>
                </p>
              )}
            </div>

            {/* CTA block — right on md+, below on mobile */}
            <div className="flex flex-col items-start md:items-end md:self-center shrink-0" style={{ gap: '0.4rem' }}>
              <button
                type="button"
                onClick={soft ? (onDismiss ?? onFix) : onFix}
                data-testid={soft ? 'matching-adrift-dismiss' : undefined}
                className="nd-adrift-cta"
                style={{
                  padding: '0.5rem 1rem',
                  border: 'none',
                  borderRadius: 'var(--radius)',
                  background: soft ? 'var(--accent)' : 'var(--status-warn)',
                  color: 'var(--bg-input)',
                  fontFamily: 'var(--nd-sans)',
                  fontWeight: 600,
                  fontSize: '0.84rem',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {soft ? 'Понятно' : 'Как вернуться в круг →'}
              </button>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                {soft ? 'подсказки в «Моих ходах»' : 'добавьте книгу из «Моих ходов»'}
              </span>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
