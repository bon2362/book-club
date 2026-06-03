'use client'

import type { AdriftCause } from '@/lib/matching/feed-events'

interface Props {
  reason: 'change' | 'never'
  cause: (AdriftCause & { bookTitle?: string | null }) | null
  onFix: () => void
  viewingUserId?: string
}

function relativeTime(ts: number): string {
  const delta = Math.max(0, Date.now() - ts)
  const minutes = Math.max(1, Math.round(delta / 60_000))
  if (minutes < 60) return `${minutes} мин назад`
  const hours = Math.round(minutes / 60)
  return `${hours} ч назад`
}

function actionVerb(kind: AdriftCause['mutationKind'], isViewer: boolean): string {
  if (isViewer) {
    if (kind === 'book_removed') return 'убрали'
    if (kind === 'book_added') return 'добавили'
    if (kind === 'status_changed') return 'изменили статус'
    return 'изменили список'
  }
  if (kind === 'book_removed') return 'убрал:а'
  if (kind === 'book_added') return 'добавил:а'
  if (kind === 'status_changed') return 'изменил:а статус'
  return 'изменил:а список'
}

export default function MatchingAdriftBanner({ reason, cause, onFix, viewingUserId }: Props) {
  const isActorViewer = !!viewingUserId && cause?.actor.userId === viewingUserId
  const actorLabel = isActorViewer ? 'вы' : (cause?.actor.pseudonym ?? '')

  return (
    <>
      <style>{`
        .nd-adrift-cta { transition: background 0.12s ease; }
        .nd-adrift-cta:hover { background: color-mix(in srgb, var(--status-warn) 80%, black) !important; }
      `}</style>

      <section
        data-testid="matching-adrift-banner"
        style={{
          background: 'var(--status-warn-soft)',
          border: '1px solid color-mix(in srgb, var(--status-warn) 30%, transparent)',
          borderLeft: '3px solid var(--status-warn)',
          borderRadius: 'var(--radius-card)',
          padding: '1rem 1.15rem',
          boxShadow: '0 1px 2px rgba(50,38,24,.05), 0 6px 18px rgba(50,38,24,.05)',
          display: 'flex',
          gap: '0.95rem',
          alignItems: 'flex-start',
          marginBottom: '0.9rem',
        }}
      >
        {/* Warning icon */}
        <div
          aria-hidden="true"
          style={{
            width: 30,
            height: 30,
            borderRadius: '50%',
            background: 'var(--bg-input)',
            color: 'var(--status-warn)',
            boxShadow: '0 0 0 4px color-mix(in srgb, var(--status-warn) 10%, transparent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1rem',
            flexShrink: 0,
            marginTop: '0.15rem',
          }}
        >
          ⚠
        </div>

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
                Вы за бортом
              </h2>

              <p style={{ margin: '0.3rem 0 0', color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5, maxWidth: '64ch' }}>
                {reason === 'change'
                  ? 'В лучшем сейчас сценарии для вас не собирается читательский круг — вы не попадаете ни в одну группу.'
                  : 'Пока ни одна из ваших книг не собрала круг — вы не входите ни в одну группу ни в одном сценарии. Так бывает в начале сессии, пока совпадений ещё мало.'}
              </p>

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
                  {/* Actor avatar */}
                  <span
                    aria-hidden="true"
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: '50%',
                      background: 'var(--chip-bg)',
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.68rem',
                      fontWeight: 700,
                      color: 'var(--text-secondary)',
                      flexShrink: 0,
                    }}
                  >
                    {actorLabel[0]?.toUpperCase() ?? '?'}
                  </span>
                  <span>
                    Вы выпали из круга после того, как{' '}
                    <strong style={{ color: 'var(--text)' }}>{actorLabel}</strong>{' '}
                    {actionVerb(cause.mutationKind, isActorViewer)}
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
                onClick={onFix}
                className="nd-adrift-cta"
                style={{
                  padding: '0.5rem 1rem',
                  border: 'none',
                  borderRadius: 'var(--radius)',
                  background: 'var(--status-warn)',
                  color: 'var(--bg-input)',
                  fontFamily: 'var(--nd-sans)',
                  fontWeight: 600,
                  fontSize: '0.84rem',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Как вернуться в круг →
              </button>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                добавьте книгу из «Моих ходов»
              </span>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
