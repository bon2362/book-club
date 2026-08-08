'use client'

import { useState } from 'react'

type LifecycleAction = 'closeSession' | 'reopenSession'

export default function MatchingBookAdminToolbar({
  sessionId,
  sessionStatus,
  stateVersion,
  onState,
  onRefresh,
}: {
  sessionId: string
  sessionStatus: string
  stateVersion: number
  onState: (state: unknown) => void
  onRefresh: () => Promise<void>
}) {
  const [pending, setPending] = useState<LifecycleAction | null>(null)
  const [error, setError] = useState<string | null>(null)
  const action: LifecycleAction = sessionStatus === 'closed' ? 'reopenSession' : 'closeSession'
  const label = action === 'closeSession' ? 'Закрыть сессию' : 'Открыть сессию снова'

  async function run() {
    const destructive = action === 'closeSession' ? 'Закрыть сессию для действий участников?' : null
    if (destructive && !window.confirm(destructive)) return
    setPending(action)
    setError(null)
    try {
      const response = await fetch(`/api/admin/matching/sessions/${sessionId}/book-admin-actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, expectedStateVersion: stateVersion }),
      })
      const body = await response.json().catch(() => ({})) as { error?: string; state?: unknown }
      if (response.status === 409 && body.state) {
        onState(body.state)
        setError('Сессия изменилась. Данные обновлены — повторите действие.')
        return
      }
      if (!response.ok) throw new Error(body.error ?? 'Не удалось изменить сессию')
      if (body.state) onState(body.state)
      else await onRefresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Не удалось изменить сессию')
    } finally {
      setPending(null)
    }
  }

  return (
    <div className="nd-mb-admin-toolbar" data-testid="matching-book-admin-toolbar">
      <span>Административный режим книжной доски</span>
      <button type="button" disabled={pending !== null} onClick={() => { void run() }}>
        {pending ? 'Подождите…' : label}
      </button>
      {error && <span className="nd-mb-admin-error" aria-live="polite">{error}</span>}
    </div>
  )
}
