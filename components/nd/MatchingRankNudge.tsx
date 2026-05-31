'use client'

import { useState, useEffect, useCallback } from 'react'

const STORAGE_KEY = 'matching-rank-nudge-dismissed'

interface Props {
  show: boolean
}

export default function MatchingRankNudge({ show }: Props) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (!show) return
    try {
      const dismissed = sessionStorage.getItem(STORAGE_KEY)
      if (!dismissed) setVisible(true)
    } catch {
      setVisible(true)
    }
  }, [show])

  const dismiss = useCallback(() => {
    setVisible(false)
    try {
      sessionStorage.setItem(STORAGE_KEY, '1')
    } catch {
      // ignore storage errors
    }
  }, [])

  useEffect(() => {
    if (!visible) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [visible, dismiss])

  if (!visible) return null

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.75rem',
        margin: '0.75rem 1rem 0',
        padding: '0.45rem 0.75rem',
        borderLeft: '2px solid var(--accent)',
        background: 'var(--bg-input)',
        fontSize: '0.72rem',
        color: 'var(--text-body)',
        fontFamily: 'var(--nd-sans)',
      }}
    >
      <span>Расставь ранги, чтобы улучшить выбор сценариев</span>
      <button
        onClick={dismiss}
        aria-label="Закрыть подсказку"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-muted)',
          fontSize: '1rem',
          lineHeight: 1,
          padding: '0 0.15rem',
          flexShrink: 0,
        }}
      >
        ×
      </button>
    </div>
  )
}
