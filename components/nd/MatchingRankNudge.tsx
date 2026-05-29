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
      className="flex items-center justify-between gap-3 mx-4 mt-3 px-3 py-2 rounded-lg bg-[#fef9c3] border border-[#fde047] text-xs text-[#713f12]"
    >
      <span>Расставь ранги, чтобы улучшить выбор сценариев</span>
      <button
        onClick={dismiss}
        aria-label="Закрыть подсказку"
        className="text-[#713f12] hover:text-[#422808] cursor-pointer text-base leading-none px-0.5 shrink-0"
      >
        ×
      </button>
    </div>
  )
}
