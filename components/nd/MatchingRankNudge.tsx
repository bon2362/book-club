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
        padding: '0.6rem 0.75rem',
        marginBottom: '0.75rem',
        borderRadius: 4,
        background: '#fffbe6',
        border: '1px solid #f5d35e',
        fontSize: '0.78rem',
        fontFamily: 'var(--nd-mono), monospace',
        color: '#7a6000',
      }}
    >
      <span>
        Расставь ранги, чтобы улучшить выбор сценариев
      </span>
      <button
        onClick={dismiss}
        aria-label="Закрыть подсказку"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: '#7a6000',
          fontSize: '0.9rem',
          lineHeight: 1,
          padding: '0 2px',
          flexShrink: 0,
        }}
      >
        ×
      </button>
    </div>
  )
}
