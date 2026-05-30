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

  return (
    <>
      {isImpersonating && (
        <div
          data-testid="admin-impersonation-banner"
          role="status"
          className="flex items-center gap-3 px-4 py-2 text-xs border-b"
          style={{
            color: '#7a5c00',
            background: '#fffbea',
            borderColor: '#f0d060',
          }}
        >
          <span>👁 Просмотр за</span>
          <strong>{viewedPseudonym ?? asParam}</strong>
          {viewedName && <span style={{ color: '#a07800' }}>({viewedName})</span>}
          <span className="ml-auto opacity-70">только чтение</span>
          <a
            href="/matching"
            className="underline text-[11px]"
            style={{ color: '#7a5c00' }}
          >
            ← вернуться к своему виду
          </a>
        </div>
      )}

      <header
        className="flex items-center justify-between gap-4 px-4 h-14 shrink-0"
        style={{
          background: '#fff',
          borderBottom: '2px solid #000',
        }}
      >
        {/* Left: session info */}
        <div className="flex items-center gap-4 min-w-0">
          <h1
            className="text-xl leading-none m-0 truncate"
            style={{ fontFamily: 'Georgia, "Times New Roman", serif', fontWeight: 700, color: '#111' }}
          >
            {sessionName}
          </h1>
          <div
            className="hidden sm:flex items-center gap-3 shrink-0"
            style={{ fontSize: '0.6rem', textTransform: 'uppercase' as const, letterSpacing: '0.12em', color: '#999' }}
          >
            <span>Группы по {targetGroupSize}</span>
            {deadlineText && (
              <span>
                Дедлайн:{' '}
                <span style={urgent ? { color: '#C0392B', fontWeight: 600 } : {}}>
                  {deadlineText}
                </span>
              </span>
            )}
            {userPseudonym && (
              <span
                style={{
                  fontSize: '0.56rem',
                  padding: '0.18rem 0.55rem',
                  borderRadius: 0,
                  fontWeight: 600,
                  background: 'transparent',
                  color: '#111',
                  border: '1px solid #111',
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.1em',
                  flexShrink: 0,
                }}
              >
                Я: {userPseudonym}
              </span>
            )}
            {sessionStatus === 'frozen' ? (
              <span
                style={{ padding: '0.12rem 0.4rem', background: 'transparent', color: '#999', border: '1px solid #d6d6d6' }}
              >
                Зафиксирована
              </span>
            ) : (
              <span style={{ color: '#2D6A4F' }}>● активна</span>
            )}
          </div>
        </div>

        {/* Right: leave button + participants popover */}
        <div className="flex items-center gap-2 shrink-0">
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
              borderBottom: '1px solid #111',
              borderRadius: 0,
              background: 'none',
              color: '#111',
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
                border: '1px solid #111',
                background: '#fff',
                color: '#666',
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              <div className="flex -space-x-2">
                {participants.slice(0, 6).map((p) => (
                  <div
                    key={p.userId}
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold"
                    style={{ background: '#111', color: '#fff', border: '2px solid #fff' }}
                    title={p.pseudonym}
                  >
                    {p.pseudonym[0].toUpperCase()}
                  </div>
                ))}
                {participants.length > 6 && (
                  <div
                    className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold"
                    style={{ background: '#fff', color: '#555', border: '1px solid #ccc' }}
                  >
                    +{participants.length - 6}
                  </div>
                )}
              </div>
              <span className="font-medium" style={{ color: '#111' }}>{participants.length}</span>
            </button>
          </Popover.Trigger>

          <Popover.Portal>
            <Popover.Content
              className="z-50 border p-3 min-w-[220px] max-w-[300px]"
              style={{
                background: '#fff',
                borderColor: '#E5E5E5',
                borderRadius: 0,
                boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
              }}
              sideOffset={8}
              align="end"
            >
              <div
                className="text-xs font-semibold mb-2.5 uppercase tracking-wide"
                style={{ color: '#999' }}
              >
                Участники ({participants.length})
              </div>
              <div className="flex flex-col gap-1">
                {participants.length === 0 ? (
                  <div className="text-sm" style={{ color: '#999' }}>
                    Пока никто не присоединился.
                  </div>
                ) : (
                  participants.map((p) => (
                    <div key={p.userId} className="flex items-center gap-2.5 py-1">
                      <div
                        className="w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0"
                        style={{ background: '#111', color: '#fff' }}
                      >
                        {p.pseudonym[0].toUpperCase()}
                      </div>
                      <span
                        className="text-sm font-medium flex-1"
                        style={{ color: '#111' }}
                      >
                        {p.pseudonym}
                      </span>
                      {isAdmin && p.name && (
                        <a
                          href={`/matching?as=${p.userId}`}
                          className="text-xs shrink-0"
                          style={{ color: '#999' }}
                          title="Посмотреть за этого участника"
                        >
                          {p.name}
                        </a>
                      )}
                    </div>
                  ))
                )}
              </div>
              <Popover.Arrow style={{ fill: '#E5E5E5' }} />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        </div>
      </header>
    </>
  )
}
