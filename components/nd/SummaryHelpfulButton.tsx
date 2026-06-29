'use client'

import { useEffect, useState } from 'react'

interface HelpfulState {
  count: number
  reacted: boolean
}

interface Props {
  summaryId: string
  initialHelpfulCount: number
  hasSession: boolean
}

async function readState(response: Response): Promise<HelpfulState> {
  if (!response.ok) throw new Error('helpful request failed')
  return response.json() as Promise<HelpfulState>
}

export default function SummaryHelpfulButton({ summaryId, initialHelpfulCount, hasSession }: Props) {
  const [count, setCount] = useState(initialHelpfulCount)
  const [reacted, setReacted] = useState(false)
  const [hydrating, setHydrating] = useState(true)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState(false)

  useEffect(() => {
    const controller = new AbortController()

    async function hydrate() {
      try {
        let state: HelpfulState | null = null
        if (hasSession) {
          try {
            state = await readState(await fetch('/api/summaries/helpful/reconcile', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ summaryId }),
              signal: controller.signal,
            }))
          } catch (requestError) {
            if (controller.signal.aborted) throw requestError
          }
        }
        if (!state) {
          state = await readState(await fetch(`/api/summaries/${encodeURIComponent(summaryId)}/helpful`, {
            signal: controller.signal,
          }))
        }
        if (!controller.signal.aborted) {
          setCount(state.count)
          setReacted(state.reacted)
        }
      } catch {
        // The public server-rendered count remains usable; the next mutation
        // repeats reconciliation and will surface an actionable error if needed.
      } finally {
        if (!controller.signal.aborted) setHydrating(false)
      }
    }

    void hydrate()
    return () => controller.abort()
  }, [hasSession, summaryId])

  async function toggle() {
    if (hydrating || pending) return
    const previous = { count, reacted }
    const nextReacted = !reacted
    setReacted(nextReacted)
    setCount(Math.max(0, count + (nextReacted ? 1 : -1)))
    setPending(true)
    setError(false)
    try {
      const state = await readState(await fetch(`/api/summaries/${encodeURIComponent(summaryId)}/helpful`, {
        method: nextReacted ? 'PUT' : 'DELETE',
      }))
      setCount(state.count)
      setReacted(state.reacted)
    } catch {
      setCount(previous.count)
      setReacted(previous.reacted)
      setError(true)
    } finally {
      setPending(false)
    }
  }

  const busy = hydrating || pending
  const label = count > 0 ? `Полезно · ${count}` : 'Полезно'

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
      <button
        type="button"
        data-testid="summary-helpful-button"
        aria-pressed={reacted}
        aria-busy={busy}
        disabled={busy}
        onClick={() => void toggle()}
        style={{
          minHeight: 38,
          padding: '0.55rem 0.9rem',
          border: `1px solid ${reacted ? 'var(--text)' : 'var(--border-strong)'}`,
          borderRadius: 'var(--radius)',
          background: reacted ? 'var(--text)' : 'transparent',
          color: reacted ? 'var(--bg)' : 'var(--text)',
          fontFamily: 'var(--nd-sans)',
          fontSize: '0.72rem',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          cursor: busy ? 'wait' : 'pointer',
          opacity: hydrating ? 0.7 : 1,
        }}
      >
        {label}
      </button>
      {error ? (
        <span role="alert" style={{ color: 'var(--accent)', fontFamily: 'var(--nd-sans)', fontSize: '0.78rem' }}>
          Не получилось. Попробуйте ещё раз.
        </span>
      ) : null}
    </div>
  )
}
