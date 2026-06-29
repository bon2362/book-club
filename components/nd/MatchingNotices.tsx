'use client'

import { useCallback, useState } from 'react'
import { useRouter } from 'next/navigation'

export interface MatchingNotice {
  id: string
  kind: string
  payload: Record<string, unknown>
  createdAt: string
}

export interface MatchingNoticesProps {
  sessionId: string
  notices: MatchingNotice[]
}

function asNames(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function noticeMessage(notice: MatchingNotice): string {
  switch (notice.kind) {
    case 'confirmation_transferred': {
      const to = asNames(notice.payload.toMembers)
      return `Твоё подтверждение перенесено в другой круг: ${to.join(', ')}.`
    }
    case 'confirmation_invalidated': {
      const members = asNames(notice.payload.members)
      return `Круг распался (${members.join(', ')}). Подтверждение снято — выбери круг заново.`
    }
    case 'circle_locked':
      return 'Круг закреплён — состав собрался полностью.'
    default:
      return 'Состояние матчинга обновилось.'
  }
}

/**
 * Durable notices о переносах/распадах/закреплении кругов. Ack уходит только по
 * явному закрытию; пока сервер не подтвердил ack, notice остаётся видимым —
 * потеря ответа не прячет уведомление (плановое требование Task 8).
 */
export default function MatchingNotices({ sessionId, notices }: MatchingNoticesProps) {
  void sessionId
  const router = useRouter()
  const [acked, setAcked] = useState<Set<string>>(() => new Set())
  const [pending, setPending] = useState<Set<string>>(() => new Set())

  const ack = useCallback(async (id: string) => {
    setPending((prev) => new Set(prev).add(id))
    try {
      const res = await fetch(`/api/matching/notices/${id}/ack`, { method: 'POST' })
      if (!res.ok) return
      setAcked((prev) => new Set(prev).add(id))
      router.refresh()
    } finally {
      setPending((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
    }
  }, [router])

  const visible = notices.filter((notice) => !acked.has(notice.id))
  if (visible.length === 0) return null

  return (
    <div data-testid="matching-notices" style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      {visible.map((notice) => (
        <div
          key={notice.id}
          role="status"
          style={{
            borderLeft: '3px solid var(--accent)',
            background: 'var(--bg-tint)',
            padding: '0.75rem 0.9rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          <span style={{ fontSize: '0.9rem', color: 'var(--text-body)', lineHeight: 1.5 }}>
            {noticeMessage(notice)}
          </span>
          <button
            type="button"
            onClick={() => ack(notice.id)}
            disabled={pending.has(notice.id)}
            style={{
              flexShrink: 0,
              border: '1px solid var(--border)',
              background: 'transparent',
              color: 'var(--text)',
              padding: '0.45rem 0.9rem',
              borderRadius: 'var(--radius)',
              fontFamily: 'var(--nd-sans)',
              fontSize: '0.66rem',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              fontWeight: 700,
              cursor: pending.has(notice.id) ? 'default' : 'pointer',
              opacity: pending.has(notice.id) ? 0.6 : 1,
            }}
          >
            Понятно
          </button>
        </div>
      ))}
    </div>
  )
}
