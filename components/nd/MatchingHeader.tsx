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
}: Props) {
  const { text: deadlineText, urgent } = useDeadlineText(deadlineAt)

  return (
    <>
      {isImpersonating && (
        <div
          data-testid="admin-impersonation-banner"
          role="status"
          className="flex items-center gap-3 px-4 py-2 text-xs text-[#7a5c00] bg-[#fffbea] border-b border-[#f0d060]"
        >
          <span>👁 Просмотр за</span>
          <strong>{viewedPseudonym ?? asParam}</strong>
          {viewedName && <span className="text-[#a07800]">({viewedName})</span>}
          <span className="ml-auto opacity-70">только чтение</span>
          <a
            href="/matching"
            className="text-[#7a5c00] underline text-[11px] hover:text-[#5c4000]"
          >
            ← вернуться к своему виду
          </a>
        </div>
      )}

      <header className="flex items-center justify-between gap-4 px-4 h-14 shrink-0 border-b border-[#ded6c8] bg-[rgba(246,242,232,0.94)] backdrop-blur-sm">
        {/* Left: session info */}
        <div className="flex items-center gap-4 min-w-0">
          <h1
            className="text-xl leading-none m-0 font-medium truncate"
            style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}
          >
            {sessionName}
          </h1>
          <div className="hidden sm:flex items-center gap-3 text-sm text-[#6d675f] shrink-0">
            <span>Группы по {targetGroupSize}</span>
            {deadlineText && (
              <span>
                Дедлайн:{' '}
                <span className={urgent ? 'text-red-600 font-medium' : ''}>
                  {deadlineText}
                </span>
              </span>
            )}
            {sessionStatus === 'frozen' ? (
              <span className="bg-[#f0f0f0] text-[#888] px-2 py-0.5 rounded text-xs">
                Зафиксирована
              </span>
            ) : (
              <span className="text-[#0f766e]">● активна</span>
            )}
          </div>
        </div>

        {/* Right: participants popover */}
        <Popover.Root>
          <Popover.Trigger asChild>
            <button className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#ded6c8] bg-[#fffdf8] hover:border-[#b8ad9b] hover:-translate-y-px transition-all text-sm text-[#6d675f] shrink-0">
              <div className="flex -space-x-2">
                {participants.slice(0, 6).map((p) => (
                  <div
                    key={p.userId}
                    className={`w-6 h-6 rounded-full border-2 border-[#fffdf8] flex items-center justify-center text-[9px] font-bold ${pseudonymColor(p.pseudonym)}`}
                    title={p.pseudonym}
                  >
                    {p.pseudonym[0].toUpperCase()}
                  </div>
                ))}
                {participants.length > 6 && (
                  <div className="w-6 h-6 rounded-full border-2 border-[#fffdf8] bg-[#ece4d5] flex items-center justify-center text-[9px] font-bold text-[#5c4a3a]">
                    +{participants.length - 6}
                  </div>
                )}
              </div>
              <span className="font-medium">{participants.length}</span>
            </button>
          </Popover.Trigger>

          <Popover.Portal>
            <Popover.Content
              className="z-50 bg-[#fffdf8] border border-[#ded6c8] rounded-xl shadow-[0_8px_32px_rgba(25,24,23,0.15)] p-3 min-w-[220px] max-w-[300px]"
              sideOffset={8}
              align="end"
            >
              <div className="text-xs font-semibold text-[#6d675f] mb-2.5 uppercase tracking-wide">
                Участники ({participants.length})
              </div>
              <div className="flex flex-col gap-1">
                {participants.length === 0 ? (
                  <div className="text-sm text-[#6d675f]">Пока никто не присоединился.</div>
                ) : (
                  participants.map((p) => (
                    <div key={p.userId} className="flex items-center gap-2.5 py-1">
                      <div
                        className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${pseudonymColor(p.pseudonym)}`}
                      >
                        {p.pseudonym[0].toUpperCase()}
                      </div>
                      <span className="text-sm font-medium text-[#191817] flex-1">{p.pseudonym}</span>
                      {isAdmin && p.name && (
                        <a
                          href={`/matching?as=${p.userId}`}
                          className="text-xs text-[#8c7b6b] hover:text-[#5c4a3a] shrink-0"
                          title="Посмотреть за этого участника"
                        >
                          {p.name}
                        </a>
                      )}
                    </div>
                  ))
                )}
              </div>
              <Popover.Arrow className="fill-[#ded6c8]" />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
      </header>
    </>
  )
}
