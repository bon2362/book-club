'use client'

import { useState, useEffect } from 'react'
import * as Popover from '@radix-ui/react-popover'

interface Participant {
  userId: string
  pseudonym: string
  name: string | null
}

interface Props {
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

const PSEUDONYM_COLORS = [
  'bg-[#fde8d8] text-[#7c3516]',
  'bg-[#dcfce7] text-[#14532d]',
  'bg-[#dbeafe] text-[#1e3a8a]',
  'bg-[#fef9c3] text-[#713f12]',
  'bg-[#f3e8ff] text-[#581c87]',
  'bg-[#ffe4e6] text-[#881337]',
  'bg-[#d1fae5] text-[#065f46]',
  'bg-[#e0f2fe] text-[#075985]',
]

function pseudonymColor(pseudonym: string) {
  let hash = 0
  for (let i = 0; i < pseudonym.length; i++) hash = pseudonym.charCodeAt(i) + ((hash << 5) - hash)
  return PSEUDONYM_COLORS[Math.abs(hash) % PSEUDONYM_COLORS.length]
}

export default function MatchingHeader({
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
        className="flex items-center justify-between gap-4 px-4 h-14 shrink-0 border-b backdrop-blur-sm"
        style={{
          borderColor: 'var(--border)',
          background: 'var(--bg-elevated)',
        }}
      >
        {/* Left: session info */}
        <div className="flex items-center gap-4 min-w-0">
          <h1
            className="text-xl leading-none m-0 font-medium truncate"
            style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
          >
            {sessionName}
          </h1>
          <div
            className="hidden sm:flex items-center gap-3 text-sm shrink-0"
            style={{ color: 'var(--text-muted)' }}
          >
            <span>Группы по {targetGroupSize}</span>
            {deadlineText && (
              <span>
                Дедлайн:{' '}
                <span className={urgent ? 'text-red-600 font-medium' : ''}>
                  {deadlineText}
                </span>
              </span>
            )}
            {userPseudonym && (
              <span
                className={`text-[11px] px-2.5 py-1 rounded-full font-medium shrink-0 ${pseudonymColor(userPseudonym)}`}
              >
                Я: {userPseudonym}
              </span>
            )}
            {sessionStatus === 'frozen' ? (
              <span
                className="px-2 py-0.5 rounded text-xs"
                style={{ background: 'var(--bg-tag)', color: 'var(--text-muted)' }}
              >
                Зафиксирована
              </span>
            ) : (
              <span style={{ color: 'var(--success)' }}>● активна</span>
            )}
          </div>
        </div>

        {/* Right: participants popover */}
        <Popover.Root>
          <Popover.Trigger asChild>
            <button
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border hover:-translate-y-px transition-all text-sm shrink-0"
              style={{
                borderColor: 'var(--border)',
                background: 'var(--bg-input)',
                color: 'var(--text-muted)',
              }}
            >
              <div className="flex -space-x-2">
                {participants.slice(0, 6).map((p) => (
                  <div
                    key={p.userId}
                    className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-[9px] font-bold ${pseudonymColor(p.pseudonym)}`}
                    style={{ borderColor: 'var(--bg-input)' }}
                    title={p.pseudonym}
                  >
                    {p.pseudonym[0].toUpperCase()}
                  </div>
                ))}
                {participants.length > 6 && (
                  <div
                    className="w-6 h-6 rounded-full border-2 flex items-center justify-center text-[9px] font-bold"
                    style={{
                      borderColor: 'var(--bg-input)',
                      background: 'var(--bg-elevated)',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    +{participants.length - 6}
                  </div>
                )}
              </div>
              <span className="font-medium">{participants.length}</span>
            </button>
          </Popover.Trigger>

          <Popover.Portal>
            <Popover.Content
              className="z-50 border rounded-xl p-3 min-w-[220px] max-w-[300px]"
              style={{
                background: 'var(--bg-input)',
                borderColor: 'var(--border)',
                boxShadow: '0 8px 32px var(--shadow)',
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
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${pseudonymColor(p.pseudonym)}`}
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
      </header>
    </>
  )
}
