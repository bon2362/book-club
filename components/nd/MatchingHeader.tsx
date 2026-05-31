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
      const urgent = delta < 3_600_000 // less than 1 hour
      if (days > 0) setState({ text: `${days} д ${hours} ч`, urgent: false })
      else if (hours > 0) setState({ text: `${hours} ч ${mins} мин`, urgent: false })
      else setState({ text: `${mins} мин`, urgent })
    }

    compute()
    const id = setInterval(compute, 60_000)
    return () => clearInterval(id)
  }, [deadlineAt])

  return state
}

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
          className="flex items-center gap-3 px-4 py-2 text-xs border-b"
          style={{
            color: 'var(--status-warn)',
            background: 'var(--bg-tag)',
            borderColor: 'var(--status-warn)',
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
        className="flex items-center justify-between gap-4 px-4 h-14 shrink-0"
        style={{
          background: 'var(--bg-input)',
          borderBottom: '2px solid var(--border-strong)',
        }}
      >
        {/* Left: session info */}
        <div className="flex items-center gap-4 min-w-0">
          <h1
            className="text-xl leading-none m-0 truncate"
            style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 700, color: 'var(--text)' }}
          >
            {sessionName}
          </h1>
          <div
            className="hidden sm:flex items-center gap-3 shrink-0"
            style={{ fontSize: '0.6rem', textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: 'var(--text-muted)' }}
          >
            {editingSize ? (
              <span className="inline-flex items-center gap-1">
                <span>Группы по</span>
                <input
                  value={sizeValue}
                  onChange={(event) => setSizeValue(event.target.value)}
                  type="number"
                  min={2}
                  className="w-12 px-1 py-0.5 border"
                  style={{
                    borderRadius: 0,
                    borderColor: 'var(--border)',
                    background: 'var(--bg-input)',
                    color: 'var(--text)',
                  }}
                />
                <button
                  type="button"
                  onClick={handleSaveGroupSize}
                  disabled={savingSize}
                  className="underline"
                  style={{ color: 'var(--text)' }}
                >
                  {savingSize ? '…' : 'Сохранить'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setSizeValue(String(targetGroupSize))
                    setEditingSize(false)
                  }}
                  className="underline"
                  style={{ color: 'var(--text-muted)' }}
                >
                  Отмена
                </button>
              </span>
            ) : isAdmin && sessionStatus === 'active' ? (
              <button
                type="button"
                onClick={() => setEditingSize(true)}
                className="underline decoration-dotted underline-offset-2"
                style={{
                  font: 'inherit',
                  letterSpacing: 'inherit',
                  textTransform: 'inherit',
                  color: 'var(--text-muted)',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                }}
              >
                Группы по {targetGroupSize}
              </button>
            ) : (
              <span>Группы по {targetGroupSize}</span>
            )}
            {deadlineText && (
              <span>
                Дедлайн:{' '}
                <span style={urgent ? { color: 'var(--accent)', fontWeight: 600 } : {}}>
                  {deadlineText}
                </span>
              </span>
            )}
            {sessionStatus === 'frozen' ? (
              <span
                style={{ padding: '0.12rem 0.4rem', background: 'transparent', color: 'var(--text-muted)', border: '1px solid var(--border)' }}
              >
                Зафиксирована
              </span>
            ) : (
              <span style={{ color: 'var(--success)' }}>● активна</span>
            )}
          </div>
        </div>

        {/* Right: leave button + participants popover */}
        <div className="flex items-center gap-2 shrink-0">
          {userPseudonym && (
            <span
              style={{
                fontSize: '0.56rem',
                padding: '0.18rem 0.55rem',
                borderRadius: 0,
                fontWeight: 600,
                background: 'transparent',
                color: 'var(--text)',
                border: '1px solid var(--border-strong)',
                textTransform: 'uppercase' as const,
                letterSpacing: '0.1em',
                flexShrink: 0,
              }}
            >
              Я: {userPseudonym}
            </span>
          )}
        {sessionStatus === 'active' && !isImpersonating && (
          <button
            onClick={handleLeave}
            disabled={leaving}
            style={{
              font: 'inherit',
              fontSize: '0.62rem',
              cursor: leaving ? 'default' : 'pointer',
              opacity: leaving ? 0.6 : 1,
              padding: '0 0 1px',
              border: 'none',
              borderBottom: '1px solid var(--border-strong)',
              borderRadius: 0,
              background: 'none',
              color: 'var(--text)',
              textTransform: 'uppercase' as const,
              letterSpacing: '0.08em',
            }}
          >
            {leaving ? '…' : 'Покинуть'}
          </button>
        )}
        <Popover.Root>
          <Popover.Trigger asChild>
            <button
              className="flex items-center gap-2 px-3 py-1.5 shrink-0"
              style={{
                borderRadius: 0,
                border: '1px solid var(--border-strong)',
                background: 'var(--bg-input)',
                color: 'var(--text-secondary)',
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              <div className="flex -space-x-2">
                {participants.slice(0, 6).map((p) => (
                  <div
                    key={p.userId}
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold"
                    style={{ background: 'var(--text)', color: 'var(--bg)', border: '2px solid var(--bg)' }}
                    title={p.pseudonym}
                  >
                    {p.pseudonym[0].toUpperCase()}
                  </div>
                ))}
                {participants.length > 6 && (
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold"
                    style={{ background: 'var(--bg-input)', color: 'var(--text-secondary)', border: '1px solid var(--border)' }}
                  >
                    +{participants.length - 6}
                  </div>
                )}
              </div>
              <span className="font-medium" style={{ color: 'var(--text)' }}>{participants.length}</span>
            </button>
          </Popover.Trigger>

          <Popover.Portal>
            <Popover.Content
              className="z-50 border p-3 min-w-[220px] max-w-[300px]"
              style={{
                background: 'var(--bg-input)',
                borderColor: 'var(--border)',
                borderRadius: 0,
                boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
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
                        style={{ background: 'var(--text)', color: 'var(--bg)' }}
                      >
                        {p.pseudonym[0].toUpperCase()}
                      </div>
                      <span
                        className="text-sm font-medium flex-1"
                        style={{ color: 'var(--text)' }}
                      >
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
              <Popover.Arrow style={{ fill: 'var(--border)' }} />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        </div>
      </header>
    </>
  )
}
