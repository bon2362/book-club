'use client'

import { useState, useEffect } from 'react'
import * as Popover from '@radix-ui/react-popover'
import type { FeedEvent } from '@/lib/matching/realtime/feed'

interface Participant {
  userId: string
  pseudonym: string
  name: string | null
}

interface Props {
  sessionId: string
  sessionName: string
  sessionStatus: string
  minGroupSize: number
  maxGroupSize: number
  deadlineAt: string | null
  participants: Participant[]
  isAdmin: boolean
  isImpersonating: boolean
  viewedPseudonym: string | null
  viewedName: string | null
  asParam: string | null
  userPseudonym: string | null
  feedEvents?: FeedEvent[]
  feedBookTitles?: Record<string, string>
}

function useDeadlineText(deadlineAt: string | null): { text: string; urgent: boolean } {
  const [state, setState] = useState({ text: '', urgent: false })

  useEffect(() => {
    if (!deadlineAt) return

    function compute() {
      const delta = new Date(deadlineAt!).getTime() - Date.now()
      if (delta <= 0) {
        setState({ text: 'Дедлайн истёк', urgent: true })
        return
      }
      const days = Math.floor(delta / 86_400_000)
      const hours = Math.floor((delta % 86_400_000) / 3_600_000)
      const mins = Math.floor((delta % 3_600_000) / 60_000)
      const urgent = delta < 3_600_000
      if (days > 0) setState({ text: `через ${days} ${days === 1 ? 'день' : days < 5 ? 'дня' : 'дней'}`, urgent: false })
      else if (hours > 0) setState({ text: `через ${hours} ч ${mins} мин`, urgent: false })
      else setState({ text: `${mins} мин`, urgent })
    }

    compute()
    const id = setInterval(compute, 60_000)
    return () => clearInterval(id)
  }, [deadlineAt])

  return state
}

const dot = (
  <span
    style={{
      display: 'inline-block',
      width: 4,
      height: 4,
      borderRadius: '50%',
      background: 'var(--hair)',
      verticalAlign: 'middle',
      margin: '0 0.1rem',
      flexShrink: 0,
    }}
  />
)

export default function MatchingHeader({
  sessionId,
  sessionName,
  sessionStatus,
  minGroupSize,
  maxGroupSize,
  deadlineAt,
  participants,
  isAdmin,
  isImpersonating,
  viewedPseudonym,
  viewedName,
  asParam,
  userPseudonym,
  feedEvents = [],
  feedBookTitles = {},
}: Props) {
  const { text: deadlineText, urgent } = useDeadlineText(deadlineAt)
  const [leaving, setLeaving] = useState(false)
  const [editingSize, setEditingSize] = useState(false)
  const [minSizeValue, setMinSizeValue] = useState(String(minGroupSize))
  const [maxSizeValue, setMaxSizeValue] = useState(String(maxGroupSize))
  const [savingSize, setSavingSize] = useState(false)
  const [feedOpen, setFeedOpen] = useState(false)

  useEffect(() => {
    setMinSizeValue(String(minGroupSize))
    setMaxSizeValue(String(maxGroupSize))
  }, [minGroupSize, maxGroupSize])

  async function handleLeave() {
    if (!window.confirm('Покинуть сессию? При следующем входе на страницу вы будете добавлены заново с новым псевдонимом.')) return
    setLeaving(true)
    try {
      await fetch(`/api/matching/sessions/${sessionId}/leave`, { method: 'DELETE' })
      window.location.href = '/'
    } finally {
      setLeaving(false)
    }
  }

  async function handleSaveGroupSize() {
    const nextMinSize = Number(minSizeValue)
    const nextMaxSize = Number(maxSizeValue)
    if (
      !Number.isInteger(nextMinSize) ||
      !Number.isInteger(nextMaxSize) ||
      nextMinSize < 2 ||
      nextMaxSize < nextMinSize
    ) return
    setSavingSize(true)
    try {
      const res = await fetch(`/api/matching/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ minGroupSize: nextMinSize, maxGroupSize: nextMaxSize }),
      })
      if (res.ok) {
        setEditingSize(false)
        window.location.reload()
      }
    } finally {
      setSavingSize(false)
    }
  }

  function resetGroupSizeEdit() {
    setMinSizeValue(String(minGroupSize))
    setMaxSizeValue(String(maxGroupSize))
    setEditingSize(false)
  }

  const groupSizeLabel = minGroupSize === maxGroupSize
    ? `Группы по ${minGroupSize}`
    : `Группы ${minGroupSize}-${maxGroupSize}`

  return (
    <>
      {isImpersonating && (
        <div
          data-testid="admin-impersonation-banner"
          role="status"
          className="flex items-center gap-3 px-4 py-2 text-xs"
          style={{
            color: 'var(--status-warn)',
            background: 'var(--chip-bg)',
            borderBottom: '1px solid var(--hair)',
          }}
        >
          <span>👁 Просмотр за</span>
          <strong>{viewedPseudonym ?? asParam}</strong>
          {viewedName && <span style={{ color: 'var(--status-warn)' }}>({viewedName})</span>}
          <span className="ml-auto opacity-70">админ-режим</span>
          <a
            href="/matching"
            className="underline text-[11px]"
            style={{ color: 'var(--status-warn)' }}
          >
            ← вернуться к своему виду
          </a>
        </div>
      )}

      <header
        className="shrink-0"
        style={{
          background: 'var(--bg-input)',
          borderBottom: '1px solid var(--hair)',
          padding: '1rem 1.4rem 0.85rem',
        }}
      >
        <div className="flex items-center justify-between gap-4">
        {/* Left: session name + meta */}
        <div className="flex items-baseline gap-3 min-w-0 flex-wrap">
          <h1
            className="leading-none m-0 truncate"
            style={{ fontFamily: 'var(--nd-serif)', fontWeight: 700, fontSize: '1.5rem', letterSpacing: '-0.01em', color: 'var(--text)' }}
          >
            {sessionName}
          </h1>
          <div
            className="hidden sm:flex items-center gap-2 shrink-0 flex-wrap"
            style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}
          >
            {editingSize ? (
              <span className="inline-flex items-baseline gap-1.5">
                <span>Группы от</span>
                <input
                  value={minSizeValue}
                  onChange={(event) => setMinSizeValue(event.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveGroupSize(); if (e.key === 'Escape') resetGroupSizeEdit() }}
                  type="number"
                  min={2}
                  autoFocus
                  className="nd-inline-number"
                  style={{
                    width: '2.4em',
                    font: 'inherit',
                    color: 'var(--text)',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '1px solid var(--border-strong)',
                    outline: 'none',
                    padding: '0 0 1px',
                    textAlign: 'center',
                  }}
                />
                <span>до</span>
                <input
                  value={maxSizeValue}
                  onChange={(event) => setMaxSizeValue(event.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveGroupSize(); if (e.key === 'Escape') resetGroupSizeEdit() }}
                  type="number"
                  min={2}
                  max={10}
                  className="nd-inline-number"
                  style={{
                    width: '2.4em',
                    font: 'inherit',
                    color: 'var(--text)',
                    background: 'transparent',
                    border: 'none',
                    borderBottom: '1px solid var(--border-strong)',
                    outline: 'none',
                    padding: '0 0 1px',
                    textAlign: 'center',
                  }}
                />
                <button
                  type="button"
                  onClick={handleSaveGroupSize}
                  disabled={savingSize}
                  style={{
                    font: 'inherit',
                    color: 'var(--accent)',
                    background: 'none',
                    border: 'none',
                    cursor: savingSize ? 'default' : 'pointer',
                    padding: 0,
                    fontWeight: 500,
                  }}
                >
                  {savingSize ? '…' : 'Сохранить'}
                </button>
                <button
                  type="button"
                  onClick={resetGroupSizeEdit}
                  style={{ font: 'inherit', color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  Отмена
                </button>
              </span>
            ) : isAdmin && sessionStatus === 'active' ? (
              <>
                <button
                  type="button"
                  onClick={() => setEditingSize(true)}
                  style={{
                    font: 'inherit',
                    color: 'var(--text-secondary)',
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: 'pointer',
                    textDecoration: 'underline dotted',
                    textUnderlineOffset: '0.15em',
                  }}
                >
                  {groupSizeLabel}
                </button>
              </>
            ) : (
              <span>{groupSizeLabel}</span>
            )}

            {deadlineText && (
              <>
                {dot}
                <span>
                  Дедлайн{' '}
                  <span style={urgent ? { color: 'var(--accent)', fontWeight: 600 } : {}}>
                    {deadlineText}
                  </span>
                </span>
              </>
            )}

            {dot}
            {sessionStatus === 'frozen' ? (
              <span style={{ color: 'var(--text-muted)' }}>зафиксирована</span>
            ) : (
              <span style={{ color: 'var(--success)', fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                <span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: '50%', background: 'var(--success)' }} />
                активна
              </span>
            )}
          </div>
        </div>

        {/* Right: identity + participants + leave */}
        <div className="flex items-center gap-4 shrink-0">
          {userPseudonym && (
            <span style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>
              Вы —{' '}
              <b style={{ fontWeight: 600, color: 'var(--text)' }}>{userPseudonym}</b>
            </span>
          )}

          <Popover.Root>
            <Popover.Trigger asChild>
              <button
                className="flex items-center gap-2 shrink-0"
                style={{
                  background: 'none',
                  border: 'none',
                  padding: '0.2rem',
                  cursor: 'pointer',
                }}
              >
                <div className="flex -space-x-2">
                  {participants.slice(0, 5).map((p) => (
                    <div
                      key={p.userId}
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold"
                      style={{ background: 'var(--chip-bg)', color: 'var(--text-secondary)', border: '2px solid var(--bg-input)' }}
                      title={p.pseudonym}
                    >
                      {p.pseudonym[0].toUpperCase()}
                    </div>
                  ))}
                  {participants.length > 5 && (
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold"
                      style={{ background: 'var(--chip-bg)', color: 'var(--text-muted)', border: '2px solid var(--bg-input)' }}
                    >
                      +{participants.length - 5}
                    </div>
                  )}
                </div>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--text-secondary)' }}>
                  {participants.length}
                </span>
              </button>
            </Popover.Trigger>

            <Popover.Portal>
              <Popover.Content
                className="z-50 p-3 min-w-[220px] max-w-[300px]"
                style={{
                  background: 'var(--bg-input)',
                  borderRadius: 'var(--radius-card)',
                  boxShadow: '0 8px 24px rgba(50,38,24,0.12)',
                  border: '1px solid var(--hair)',
                }}
                sideOffset={8}
                align="end"
              >
                <div
                  className="text-xs font-semibold mb-2.5 uppercase tracking-wide"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Участники ({participants.length})
                </div>
                <div className="flex flex-col gap-1">
                  {participants.length === 0 ? (
                    <div className="text-sm" style={{ color: 'var(--text-muted)' }}>
                      Пока никто не присоединился.
                    </div>
                  ) : (
                    participants.map((p) => (
                      <div key={p.userId} className="flex items-center gap-2.5 py-1">
                        <div
                          className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                          style={{ background: 'var(--chip-bg)', color: 'var(--text-secondary)' }}
                        >
                          {p.pseudonym[0].toUpperCase()}
                        </div>
                        <span className="text-sm font-medium flex-1" style={{ color: 'var(--text)' }}>
                          {p.pseudonym}
                        </span>
                        {isAdmin && p.name && (
                          <a
                            href={`/matching?as=${p.userId}`}
                            className="text-xs shrink-0"
                            style={{ color: 'var(--text-muted)' }}
                            title="Посмотреть за этого участника"
                          >
                            {p.name}
                          </a>
                        )}
                      </div>
                    ))
                  )}
                </div>
                <Popover.Arrow style={{ fill: 'var(--hair)' }} />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>

          {sessionStatus === 'active' && !isImpersonating && (
            <button
              onClick={handleLeave}
              disabled={leaving}
              style={{
                font: 'inherit',
                fontSize: '0.8rem',
                cursor: leaving ? 'default' : 'pointer',
                opacity: leaving ? 0.6 : 1,
                padding: 0,
                border: 'none',
                background: 'none',
                color: 'var(--text-muted)',
              }}
              onMouseEnter={(e) => { if (!leaving) (e.target as HTMLElement).style.color = 'var(--accent)' }}
              onMouseLeave={(e) => { (e.target as HTMLElement).style.color = 'var(--text-muted)' }}
            >
              {leaving ? '…' : 'Покинуть'}
            </button>
          )}
        </div>
        </div>
        {feedEvents.length > 0 && (
          <MatchingFeedTicker
            events={feedEvents}
            bookTitles={feedBookTitles}
            open={feedOpen}
            onToggle={() => setFeedOpen((value) => !value)}
            userPseudonym={userPseudonym}
          />
        )}
      </header>
    </>
  )
}

/** Цветной чип-тег для типа события в ленте */
function FeedKeyChip({ event, size = 'normal' }: { event: FeedEvent; size?: 'normal' | 'compact' }) {
  const isWarn = event.type === 'leftout'
  const icon = isWarn ? '⚠' : '★'
  const label = isWarn ? 'За бортом' : 'Лучший расклад'
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.3rem',
        padding: size === 'compact' ? '0.1rem 0.4rem' : '0.16rem 0.55rem',
        borderRadius: 'var(--radius-pill)',
        fontWeight: 700,
        fontSize: size === 'compact' ? '0.72rem' : '0.8rem',
        whiteSpace: 'nowrap',
        color: isWarn ? 'var(--status-warn)' : 'var(--accent)',
        background: isWarn ? 'var(--status-warn-soft)' : 'var(--accent-soft)',
      }}
    >
      <span aria-hidden="true" style={{ fontSize: size === 'compact' ? '0.65rem' : '0.75rem' }}>{icon}</span>
      {label}
    </span>
  )
}

/** Пульсирующая live-точка */
function LiveDot() {
  return (
    <>
      <style>{`
        .t-live-dot {
          position: relative;
          width: 7px; height: 7px;
          border-radius: 50%;
          background: var(--accent);
          flex-shrink: 0;
        }
        .t-ping-ring {
          position: absolute;
          inset: 0;
          border-radius: 50%;
          background: var(--accent);
          animation: t-ping 2.2s ease-out infinite;
        }
        @keyframes t-ping {
          0%   { transform: scale(1); opacity: 0.45; }
          100% { transform: scale(2.6); opacity: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          .t-ping-ring { animation: none; }
        }
      `}</style>
      <span className="t-live-dot" aria-hidden="true">
        <span className="t-ping-ring" />
      </span>
    </>
  )
}

function MatchingFeedTicker({
  events,
  bookTitles,
  open,
  onToggle,
  userPseudonym,
}: {
  events: FeedEvent[]
  bookTitles: Record<string, string>
  open: boolean
  onToggle: () => void
  userPseudonym: string | null
}) {
  const latest = events[events.length - 1]

  return (
    <div style={{ marginTop: '0.85rem', borderTop: '1px solid var(--hair)', paddingTop: '0.65rem' }}>
      <button
        type="button"
        onClick={onToggle}
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          gap: '0.55rem',
          border: '1px solid var(--hair)',
          borderRadius: 'var(--radius)',
          background: 'var(--chip-bg)',
          boxShadow: '0 1px 2px rgba(50,38,24,.04)',
          color: 'var(--text)',
          padding: '0.55rem 0.7rem',
          cursor: 'pointer',
          textAlign: 'left',
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget
          el.style.borderColor = 'var(--accent)'
          el.style.boxShadow = '0 2px 6px rgba(50,38,24,.10)'
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget
          el.style.borderColor = 'var(--hair)'
          el.style.boxShadow = '0 1px 2px rgba(50,38,24,.04)'
        }}
      >
        <LiveDot />
        <span style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-muted)', fontWeight: 700 }}>
          Лента
        </span>
        <FeedKeyChip event={latest} />
        <span className="hidden sm:inline" style={{ color: 'var(--text-muted)', fontSize: '0.76rem', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {feedDetail(latest, bookTitles, userPseudonym)}
        </span>
        <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '0.72rem' }}>{relativeFeedTime(latest.ts)}</span>
        <span aria-hidden="true" style={{ color: 'var(--text-muted)' }}>{open ? '⌃' : '⌄'}</span>
      </button>
      {open && (
        <ol
          data-testid="matching-feed"
          style={{
            listStyle: 'none',
            margin: 0,
            padding: '0.65rem 0.2rem 0',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.55rem',
          }}
        >
          {[...events].reverse().map((event) => (
            <li
              key={event.id}
              style={{
                display: 'grid',
                gridTemplateColumns: '4.5rem minmax(0, 1fr)',
                gap: '0.7rem',
                fontSize: '0.78rem',
                color: 'var(--text-secondary)',
              }}
            >
              <span style={{ color: 'var(--text-muted)' }}>{relativeFeedTime(event.ts)}</span>
              <span style={{ display: 'flex', alignItems: 'baseline', gap: '0.4rem', flexWrap: 'wrap' }}>
                <FeedKeyChip event={event} size="compact" />
                <span style={{ color: 'var(--text-muted)' }}>{feedDetail(event, bookTitles, userPseudonym)}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  )
}

/**
 * Строка детали события для тикера/лога.
 * userPseudonym — псевдоним залогиненного пользователя (null когда не известен).
 * Сравнение по псевдониму безопасно: они уникальны внутри сессии.
 */
function feedDetail(event: FeedEvent, bookTitles: Record<string, string>, userPseudonym: string | null): string {
  const title = bookTitles[event.bookId] ?? 'книгу'
  const isActorViewer = !!userPseudonym && event.actor.pseudonym === userPseudonym
  const actorName = isActorViewer ? 'вы' : event.actor.pseudonym

  let verb: string
  if (isActorViewer) {
    verb = event.mutationKind === 'book_removed' ? 'убрали'
      : event.mutationKind === 'book_added' ? 'добавили'
      : 'изменили'
  } else {
    verb = event.mutationKind === 'book_removed' ? 'убрал:а'
      : event.mutationKind === 'book_added' ? 'добавил:а'
      : 'изменил:а'
  }

  if (event.type === 'best' && event.before && event.after && event.after.coveredCount > event.before.coveredCount) {
    return `покрытие ${event.before.coveredCount} → ${event.after.coveredCount} участников после того как ${actorName} ${verb} «${title}»`
  }

  if (event.type === 'leftout') {
    const isAffectedViewer = !!userPseudonym && event.affected.pseudonym === userPseudonym
    const affectedName = isAffectedViewer ? 'вы' : event.affected.pseudonym
    return `${affectedName} — после того как ${actorName} ${verb} «${title}»`
  }

  return `после того как ${actorName} ${verb} «${title}»`
}

function relativeFeedTime(ts: number): string {
  const minutes = Math.max(1, Math.round((Date.now() - ts) / 60_000))
  if (minutes < 60) return `${minutes} мин`
  return `${Math.round(minutes / 60)} ч`
}
