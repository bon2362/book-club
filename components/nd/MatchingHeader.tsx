'use client'

import { useState, useEffect } from 'react'
import * as Popover from '@radix-ui/react-popover'
import type { FeedEvent } from '@/lib/matching/realtime/feed'
import { pseudonymPastVerb } from '@/lib/matching/pseudonym-declension'

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
  optimizationMode: 'coverage' | 'satisfaction'
  canSwitchMode: boolean
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
  optimizationMode,
  canSwitchMode,
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
  const [switchingMode, setSwitchingMode] = useState(false)
  const [modeError, setModeError] = useState<string | null>(null)
  const [feedOpen, setFeedOpen] = useState(false)

  // Онлайн-статус участников (#338): пока попап «Участники» открыт, опрашиваем
  // /api/matching/version (он же heartbeat) и подсвечиваем онлайн зелёной точкой.
  const [participantsOpen, setParticipantsOpen] = useState(false)
  const [onlinePseudonyms, setOnlinePseudonyms] = useState<Set<string>>(new Set())

  useEffect(() => {
    if (!participantsOpen) return
    let cancelled = false
    const poll = async () => {
      try {
        const res = await fetch(`/api/matching/version?session=${sessionId}`)
        if (!res.ok) return
        const data = (await res.json()) as { online?: string[] }
        if (!cancelled) setOnlinePseudonyms(new Set(data.online ?? []))
      } catch {
        /* сеть моргнула — оставим прошлый снимок */
      }
    }
    poll()
    const timer = setInterval(poll, 4_000)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [participantsOpen, sessionId])

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
  const nextOptimizationMode = optimizationMode === 'coverage' ? 'satisfaction' : 'coverage'
  const modeLabel = optimizationMode === 'coverage' ? 'покрытие' : 'удовлетворённость'
  const nextModeLabel = nextOptimizationMode === 'coverage' ? 'покрытие' : 'удовлетворённость'

  async function handleSwitchMode() {
    if (switchingMode || !canSwitchMode) return
    setSwitchingMode(true)
    setModeError(null)
    try {
      const res = await fetch(`/api/matching/sessions/${sessionId}/mode`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ optimizationMode: nextOptimizationMode }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(json.error ?? 'Не удалось переключить режим')
      window.location.reload()
    } catch (error) {
      setModeError(error instanceof Error ? error.message : 'Не удалось переключить режим')
    } finally {
      setSwitchingMode(false)
    }
  }

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
          background: 'var(--bg)',
          padding: '0.65rem 1.4rem 0.6rem',
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

            {isAdmin && (
              <>
                {dot}
                <span>Режим: {modeLabel}</span>
              </>
            )}
            {isAdmin && sessionStatus === 'active' && (
              <>
                <button
                  type="button"
                  onClick={handleSwitchMode}
                  disabled={switchingMode || !canSwitchMode}
                  title={canSwitchMode ? undefined : 'Доступно, когда у всех участников активные книги расставлены по приоритету'}
                  data-testid="matching-mode-toggle"
                  style={{
                    font: 'inherit',
                    color: canSwitchMode ? 'var(--accent)' : 'var(--text-muted)',
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    cursor: switchingMode || !canSwitchMode ? 'default' : 'pointer',
                    textDecoration: canSwitchMode ? 'underline dotted' : 'none',
                    textUnderlineOffset: '0.15em',
                    opacity: switchingMode ? 0.7 : 1,
                  }}
                >
                  {switchingMode ? 'Переключаю…' : `Переключить на ${nextModeLabel}`}
                </button>
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

          <Popover.Root onOpenChange={setParticipantsOpen}>
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
                      style={{ background: 'var(--chip-bg)', color: 'var(--text-secondary)' }}
                      title={p.pseudonym}
                    >
                      {p.pseudonym[0].toUpperCase()}
                    </div>
                  ))}
                  {participants.length > 5 && (
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center text-[9px] font-bold"
                      style={{ background: 'var(--chip-bg)', color: 'var(--text-muted)' }}
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
                    participants.map((p) => {
                      const online = onlinePseudonyms.has(p.pseudonym)
                      return (
                      <div key={p.userId} className="flex items-center gap-2.5 py-1">
                        <div className="relative shrink-0">
                          <div
                            className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold"
                            style={{ background: 'var(--chip-bg)', color: 'var(--text-secondary)' }}
                          >
                            {p.pseudonym[0].toUpperCase()}
                          </div>
                          {online && (
                            <span
                              data-testid="participant-online-dot"
                              aria-label="онлайн"
                              className="absolute bottom-0 right-0 w-2 h-2 rounded-full"
                              style={{ background: 'var(--success)', border: '1.5px solid var(--bg-input)' }}
                            />
                          )}
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
                      )
                    })
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
        {modeError && (
          <p
            role="status"
            data-testid="matching-mode-toggle-error"
            style={{
              margin: '0.45rem 0 0',
              fontSize: '0.74rem',
              color: 'var(--accent)',
            }}
          >
            {modeError}
          </p>
        )}
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
function FeedKeyChip({
  event,
  size = 'normal',
  userPseudonym,
}: {
  event: FeedEvent
  size?: 'normal' | 'compact'
  userPseudonym?: string | null
}) {
  // Регрессию (изменение без улучшения) подсвечиваем как предупреждение —
  // наравне с выпадением участника из круга.
  const isWarn = event.type === 'leftout' || (event.type === 'best' && !event.improved)

  let icon: string
  let label: string
  if (event.type === 'best') {
    const added = event.addedCircleBookIds.length > 0
    const removed = event.removedCircleBookIds.length > 0
    if (added && removed) {
      icon = '↺'
      label = 'Расклад изменился'
    } else if (added) {
      icon = '＋'
      label = 'Появился круг'
    } else if (removed) {
      icon = '－'
      label = 'Круг распался'
    } else if (event.improved) {
      icon = '↑'
      label = 'Расклад укрепился'
    } else {
      icon = '↓'
      label = 'Расклад ослаб'
    }
  } else {
    icon = '⚠'
    const isAffectedViewer = !!userPseudonym && event.affected.pseudonym === userPseudonym
    label = isAffectedViewer
      ? 'Вы остались за бортом'
      : `${event.affected.pseudonym} ${pseudonymPastVerb(event.affected.pseudonym, { m: 'остался', f: 'осталась', n: 'осталось' })} за бортом`
  }

  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '0.3rem',
        padding: size === 'compact' ? '0.1rem 0.4rem' : '0.16rem 0.55rem',
        borderRadius: 'var(--radius-pill)',
        border: `1px solid ${isWarn ? 'var(--feed-warn-border)' : 'var(--feed-best-border)'}`,
        fontWeight: 700,
        fontSize: size === 'compact' ? '0.72rem' : '0.8rem',
        whiteSpace: 'nowrap',
        color: isWarn ? 'var(--feed-warn-text)' : 'var(--feed-best-text)',
        background: isWarn ? 'var(--feed-warn-bg)' : 'var(--feed-best-bg)',
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
    <div style={{ marginTop: '0.45rem' }}>
      {/* Скруглённый контейнер — clips button + expanded list к одним углам */}
      <div
        style={{
          border: '1px solid var(--hair)',
          borderRadius: 'var(--radius-card)',
          overflow: 'hidden',
          boxShadow: '0 1px 2px rgba(50,38,24,.04)',
        }}
      >
        <button
          type="button"
          onClick={onToggle}
          data-testid="matching-feed-toggle"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: '0.55rem',
            border: 'none',
            background: 'var(--bg-input)',
            color: 'var(--text)',
            padding: '0.55rem 0.7rem',
            cursor: 'pointer',
            textAlign: 'left',
            transition: 'background 0.12s ease',
          }}
          onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--chip-bg)' }}
          onMouseLeave={(e) => { e.currentTarget.style.background = 'var(--bg-input)' }}
        >
          <LiveDot />
          <span style={{ fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-muted)', fontWeight: 700 }}>
            Лента
          </span>
          <FeedKeyChip event={latest} userPseudonym={userPseudonym} />
          <span className="hidden sm:inline" style={{ color: 'var(--text-muted)', fontSize: '0.76rem', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {feedDetail(latest, bookTitles, userPseudonym)}
          </span>
          <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>{relativeFeedTime(latest.ts)}</span>
            <span
              style={{
                minWidth: 18,
                height: 18,
                borderRadius: 'var(--radius-pill)',
                background: latest.type === 'leftout' ? 'var(--status-warn)' : 'var(--accent)',
                color: 'var(--bg-input)',
                fontSize: '0.65rem',
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: '0 0.3rem',
              }}
            >
              {events.length}
            </span>
            <span aria-hidden="true" style={{ color: 'var(--text-muted)' }}>{open ? '⌃' : '⌄'}</span>
          </span>
        </button>

        {open && (
          <ol
            data-testid="matching-feed"
            style={{
              listStyle: 'none',
              margin: 0,
              padding: '0.6rem 0.85rem 0.7rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.55rem',
              background: 'var(--bg-input)',
              borderTop: '1px solid var(--hair)',
              maxHeight: '18rem',
              overflowY: 'auto',
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
                  <FeedKeyChip event={event} size="compact" userPseudonym={userPseudonym} />
                  <span style={{ color: 'var(--text-muted)' }}>{feedDetail(event, bookTitles, userPseudonym)}</span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  )
}

/**
 * Строка детали события для тикера/лога.
 * userPseudonym — псевдоним залогиненного пользователя (null когда не известен).
 * Сравнение по псевдониму безопасно: они уникальны внутри сессии.
 */
function feedDetail(event: FeedEvent, bookTitles: Record<string, string>, userPseudonym: string | null): string {
  const isActorViewer = !!userPseudonym && event.actor.pseudonym === userPseudonym
  const actorName = isActorViewer ? 'вы' : event.actor.pseudonym

  // Глагол и действие-актора по mutationKind
  let action: string
  if (event.mutationKind === 'participant_left') {
    const verb = isActorViewer
      ? 'вышли из сессии'
      : pseudonymPastVerb(event.actor.pseudonym, { m: 'вышел из сессии', f: 'вышла из сессии', n: 'вышло из сессии' })
    action = `${actorName} ${verb}`
  } else if (event.mutationKind === 'book_added') {
    const title = bookTitles[event.bookId] ?? 'книгу'
    const verb = isActorViewer
      ? 'добавили'
      : pseudonymPastVerb(event.actor.pseudonym, { m: 'добавил', f: 'добавила', n: 'добавило' })
    action = `${actorName} ${verb} «${title}»`
  } else if (event.mutationKind === 'book_removed') {
    const title = bookTitles[event.bookId] ?? 'книгу'
    const verb = isActorViewer
      ? 'убрали'
      : pseudonymPastVerb(event.actor.pseudonym, { m: 'убрал', f: 'убрала', n: 'убрало' })
    action = `${actorName} ${verb} «${title}»`
  } else {
    // rank_changed | priorities_updated | status_changed | catalog_signup_updated
    const verb = isActorViewer
      ? 'изменили приоритеты'
      : pseudonymPastVerb(event.actor.pseudonym, { m: 'изменил приоритеты', f: 'изменила приоритеты', n: 'изменило приоритеты' })
    action = `${actorName} ${verb}`
  }

  // Суффикс по подтипу (только для best)
  if (event.type === 'best') {
    if (event.mutationKind === 'participant_left') {
      return `${action} → расклад пересчитался`
    }
    const added = event.addedCircleBookIds.length > 0
    const removed = event.removedCircleBookIds.length > 0
    if (added && !removed) {
      // circle_added
      const after = event.after
      if (after) {
        return `${action} → теперь в раскладе ${after.coveredCount} из ${after.totalCount}`
      }
      return action
    }
    if (!added && !removed) {
      // Состав кругов не менялся — меняется охват/качество.
      const before = event.before
      const after = event.after
      if (before && after && before.coveredCount !== after.coveredCount) {
        return `${action} → покрытие ${before.coveredCount} → ${after.coveredCount} участников`
      }
      return event.improved ? `${action} → расклад укрепился` : `${action} → расклад ослаб`
    }
    if (removed && !added) {
      // circle_removed
      return `${action} → круг распался`
    }
    // scenario_changed (added && removed) — без суффикса
    return action
  }

  // leftout — только действие актора (affected уже показан в FeedKeyChip)
  return action
}

function relativeFeedTime(ts: number): string {
  const minutes = Math.max(1, Math.round((Date.now() - ts) / 60_000))
  if (minutes < 60) return `${minutes} мин`
  return `${Math.round(minutes / 60)} ч`
}
