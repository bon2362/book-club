'use client'

import { useState, useEffect } from 'react'
import * as Popover from '@radix-ui/react-popover'

interface Participant {
  userId: string
  pseudonym: string
  name: string | null
}

interface Props {
  sessionId: string
  sessionName: string
  sessionStatus: string
  targetGroupSize: number
  deadlineAt: string | null
  participants: Participant[]
  isAdmin: boolean
  isImpersonating: boolean
  viewedPseudonym: string | null
  viewedName: string | null
  asParam: string | null
  userPseudonym: string | null
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
  targetGroupSize,
  deadlineAt,
  participants,
  isAdmin,
  isImpersonating,
  viewedPseudonym,
  viewedName,
  asParam,
  userPseudonym,
}: Props) {
  const { text: deadlineText, urgent } = useDeadlineText(deadlineAt)
  const [leaving, setLeaving] = useState(false)
  const [editingSize, setEditingSize] = useState(false)
  const [sizeValue, setSizeValue] = useState(String(targetGroupSize))
  const [savingSize, setSavingSize] = useState(false)

  useEffect(() => {
    setSizeValue(String(targetGroupSize))
  }, [targetGroupSize])

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
    const nextSize = Number(sizeValue)
    if (!Number.isInteger(nextSize) || nextSize < 2) return
    setSavingSize(true)
    try {
      const res = await fetch(`/api/matching/sessions/${sessionId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ targetGroupSize: nextSize }),
      })
      if (res.ok) {
        setEditingSize(false)
        window.location.reload()
      }
    } finally {
      setSavingSize(false)
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
        className="flex items-center justify-between gap-4 shrink-0"
        style={{
          background: 'var(--bg-input)',
          borderBottom: '1px solid var(--hair)',
          padding: '1rem 1.4rem 0.85rem',
        }}
      >
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
                <span>Группы по</span>
                <input
                  value={sizeValue}
                  onChange={(event) => setSizeValue(event.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveGroupSize(); if (e.key === 'Escape') { setSizeValue(String(targetGroupSize)); setEditingSize(false) } }}
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
                  onClick={() => { setSizeValue(String(targetGroupSize)); setEditingSize(false) }}
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
                  Группы по {targetGroupSize}
                </button>
              </>
            ) : (
              <span>Группы по {targetGroupSize}</span>
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
      </header>
    </>
  )
}
