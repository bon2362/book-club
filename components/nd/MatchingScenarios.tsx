'use client'

import { useState } from 'react'
import MatchingConfirmationDialog from './MatchingConfirmationDialog'

// Public state types coming from assemblePublicSessionState
export interface PublicScenarioMember {
  ref: string
  displayName: string
  confirmed: boolean
}

export interface PublicScenarioCircle {
  circleKey: string
  bookId: string
  members: PublicScenarioMember[]
  confirmedCount: number
  memberCount: number
  viewerIsMember: boolean
}

export interface PublicScenario {
  ref: string
  circles: PublicScenarioCircle[]
}

export interface MatchingScenariosProps {
  sessionId: string
  stateVersion: number
  scenarios: PublicScenario[]
  /** The viewer's confirmed circleKey, or null if not confirmed */
  viewerConfirmedCircleKey: string | null
  viewerRole: 'active' | 'observer'
  frozen: boolean
  bookTitleById?: Record<string, string>
  onConfirmationChange?: () => void
}

function pluralizeCircles(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'круг'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'круга'
  return 'кругов'
}

export default function MatchingScenarios({
  sessionId,
  stateVersion,
  scenarios,
  viewerConfirmedCircleKey,
  viewerRole,
  frozen,
  bookTitleById = {},
  onConfirmationChange,
}: MatchingScenariosProps) {
  const [pendingCircle, setPendingCircle] = useState<PublicScenarioCircle | null>(null)
  const [pendingBookTitle, setPendingBookTitle] = useState<string>('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [actionPending, setActionPending] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  const isReadOnly = frozen || viewerRole === 'observer'

  async function confirmCircle(circle: PublicScenarioCircle) {
    setActionPending(circle.circleKey)
    setErrorMsg(null)
    try {
      const res = await fetch(`/api/matching/sessions/${sessionId}/confirmation`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ circleKey: circle.circleKey, expectedStateVersion: stateVersion }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErrorMsg(json.error ?? 'Не удалось подтвердить круг')
        return
      }
      onConfirmationChange?.()
    } finally {
      setActionPending(null)
      setDialogOpen(false)
      setPendingCircle(null)
    }
  }

  async function cancelConfirmation() {
    setActionPending('cancel')
    setErrorMsg(null)
    try {
      const res = await fetch(`/api/matching/sessions/${sessionId}/confirmation`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expectedStateVersion: stateVersion }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) {
        setErrorMsg(json.error ?? 'Не удалось отменить подтверждение')
        return
      }
      onConfirmationChange?.()
    } finally {
      setActionPending(null)
    }
  }

  function openConfirmDialog(circle: PublicScenarioCircle) {
    setPendingCircle(circle)
    setPendingBookTitle(bookTitleById[circle.bookId] ?? 'Книга')
    setDialogOpen(true)
  }

  // Find the circle viewer is currently confirmed in (to show as "from" in dialog)
  const viewerCurrentCircle = viewerConfirmedCircleKey
    ? scenarios.flatMap((s) => s.circles).find((c) => c.circleKey === viewerConfirmedCircleKey) ?? null
    : null
  const viewerCurrentBookTitle = viewerCurrentCircle
    ? (bookTitleById[viewerCurrentCircle.bookId] ?? 'Книга')
    : null

  if (scenarios.length === 0) {
    return (
      <div
        data-testid="matching-scenarios-empty"
        style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--nd-sans)' }}
      >
        Пока недостаточно участников для формирования кругов.
      </div>
    )
  }

  return (
    <>
      {errorMsg && (
        <div
          role="alert"
          style={{
            borderLeft: '3px solid var(--accent)',
            background: 'var(--bg-tint)',
            padding: '0.6rem 0.9rem',
            fontSize: '0.85rem',
            color: 'var(--accent)',
            marginBottom: '0.7rem',
          }}
        >
          {errorMsg}
        </div>
      )}

      <ul
        data-testid="matching-scenarios-list"
        style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.7rem' }}
      >
        {scenarios.map((scenario, index) => (
          <li
            key={scenario.ref}
            data-testid="matching-scenario-card"
            style={{
              background: 'var(--bg-input)',
              border: '1px solid var(--hair)',
              padding: '0.85rem 1rem',
            }}
          >
            {/* Scenario header — equal styling, no leader highlight */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
              <h3
                style={{
                  margin: 0,
                  fontFamily: 'var(--nd-sans)',
                  fontSize: '0.62rem',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  color: 'var(--text-muted)',
                }}
              >
                Сценарий {index + 1}
              </h3>
              <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                {scenario.circles.length} {pluralizeCircles(scenario.circles.length)}
              </span>
            </div>

            {/* Circles */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              {scenario.circles.map((circle, ci) => {
                const isViewerMember = circle.viewerIsMember
                const isWaiting = isViewerMember && viewerConfirmedCircleKey === circle.circleKey
                const hasOtherConfirmation = !isWaiting && viewerConfirmedCircleKey !== null
                const bookTitle = bookTitleById[circle.bookId] ?? 'Книга'
                const isPendingAction = actionPending === circle.circleKey

                return (
                  <div
                    key={circle.circleKey}
                    data-testid="matching-circle"
                    style={{
                      borderTop: ci === 0 ? 'none' : '1px solid var(--hair-soft)',
                      paddingTop: ci === 0 ? 0 : '0.85rem',
                    }}
                  >
                    {/* Book title */}
                    <div
                      style={{
                        fontFamily: 'var(--nd-serif)',
                        fontWeight: 700,
                        fontSize: '1rem',
                        color: 'var(--text)',
                        marginBottom: '0.45rem',
                      }}
                    >
                      {bookTitle}
                    </div>

                    {/* Members */}
                    <div
                      style={{
                        paddingLeft: '0.6rem',
                        borderLeft: '2px solid var(--hair)',
                        marginBottom: '0.55rem',
                      }}
                    >
                      <div
                        style={{
                          fontSize: '0.6rem',
                          fontWeight: 700,
                          textTransform: 'uppercase',
                          letterSpacing: '0.12em',
                          color: 'var(--text-muted)',
                          marginBottom: '0.3rem',
                        }}
                      >
                        круг
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem 0.6rem' }}>
                        {circle.members.map((member) => (
                          <span
                            key={member.ref}
                            style={{
                              fontSize: '0.85rem',
                              color: member.confirmed ? 'var(--success)' : 'var(--text-body)',
                              fontWeight: member.confirmed ? 600 : 400,
                            }}
                          >
                            {member.displayName}
                            {member.confirmed && (
                              <span
                                aria-label="подтвердил"
                                style={{ marginLeft: '0.25rem', fontSize: '0.7rem', color: 'var(--success)' }}
                              >
                                ✓
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    </div>

                    {/* Waiting state — viewer confirmed this circle */}
                    {isWaiting && (
                      <div
                        data-testid="circle-waiting"
                        style={{
                          borderLeft: '3px solid var(--success)',
                          background: 'var(--bg-tag-green)',
                          padding: '0.5rem 0.7rem',
                          marginBottom: '0.45rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          gap: '0.8rem',
                          flexWrap: 'wrap',
                        }}
                      >
                        <span style={{ fontSize: '0.82rem', color: 'var(--success)', fontWeight: 600 }}>
                          Подтверждено · {circle.confirmedCount} из {circle.memberCount} · временно
                        </span>
                        {!isReadOnly && (
                          <button
                            type="button"
                            data-testid="circle-cancel-button"
                            onClick={cancelConfirmation}
                            disabled={actionPending === 'cancel'}
                            style={{
                              flexShrink: 0,
                              border: '1px solid var(--border)',
                              background: 'transparent',
                              color: 'var(--text)',
                              padding: '0.35rem 0.7rem',
                              borderRadius: 'var(--radius)',
                              fontFamily: 'var(--nd-sans)',
                              fontSize: '0.62rem',
                              letterSpacing: '0.1em',
                              textTransform: 'uppercase',
                              fontWeight: 700,
                              cursor: actionPending === 'cancel' ? 'default' : 'pointer',
                              opacity: actionPending === 'cancel' ? 0.6 : 1,
                            }}
                          >
                            Отменить
                          </button>
                        )}
                      </div>
                    )}

                    {/* CTA — viewer is a member but not yet confirmed this circle (and not read-only) */}
                    {isViewerMember && !isWaiting && !isReadOnly && (
                      <div className="nd-circle-cta">
                        <button
                          type="button"
                          data-testid="circle-confirm-button"
                          onClick={() => {
                            if (hasOtherConfirmation) {
                              openConfirmDialog(circle)
                            } else {
                              openConfirmDialog(circle)
                            }
                          }}
                          disabled={!!isPendingAction}
                          style={{
                            border: 'none',
                            background: 'var(--accent)',
                            color: 'var(--bg-input)',
                            padding: '0.5rem 1rem',
                            borderRadius: 'var(--radius)',
                            fontFamily: 'var(--nd-sans)',
                            fontSize: '0.68rem',
                            letterSpacing: '0.08em',
                            textTransform: 'uppercase',
                            fontWeight: 700,
                            cursor: isPendingAction ? 'default' : 'pointer',
                            opacity: isPendingAction ? 0.6 : 1,
                          }}
                        >
                          {isPendingAction ? 'Подтверждаем…' : 'Хочу в этот круг'}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </li>
        ))}
      </ul>

      {/* Confirmation / switch dialog */}
      {pendingCircle && (
        <MatchingConfirmationDialog
          open={dialogOpen}
          from={viewerCurrentCircle && viewerCurrentBookTitle ? {
            bookTitle: viewerCurrentBookTitle,
            members: viewerCurrentCircle.members.map((m) => m.displayName),
          } : null}
          to={{
            bookTitle: pendingBookTitle,
            members: pendingCircle.members.map((m) => m.displayName),
          }}
          onConfirm={() => {
            if (pendingCircle) confirmCircle(pendingCircle)
          }}
          onCancel={() => {
            setDialogOpen(false)
            setPendingCircle(null)
          }}
        />
      )}
    </>
  )
}
