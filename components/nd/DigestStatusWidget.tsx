'use client'

import { useEffect, useState, useCallback } from 'react'

type DigestStatusData =
  | { status: 'empty' }
  | { status: 'ready'; count: number }
  | { status: 'cooling'; count: number; sendAt: string }

function minutesUntil(isoDate: string): number {
  return Math.max(0, Math.ceil((new Date(isoDate).getTime() - Date.now()) / 60_000))
}

const WIDGET_STYLE: React.CSSProperties = {
  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
  fontSize: '0.7rem',
  color: '#999',
  display: 'flex',
  alignItems: 'center',
  gap: '0.3rem',
}

export default function DigestStatusWidget() {
  const [data, setData] = useState<DigestStatusData | null>(null)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/digest-status')
      if (res.ok) setData(await res.json())
    } catch {
      // silently ignore fetch errors — widget stays with last known state
    }
  }, [])

  useEffect(() => {
    fetchStatus()
    const id = setInterval(fetchStatus, 60_000)
    return () => clearInterval(id)
  }, [fetchStatus])

  if (!data) return null

  const dot =
    data.status === 'ready' ? (
      <span style={{ color: '#22c55e' }}>●</span>
    ) : data.status === 'cooling' ? (
      <span style={{ color: '#f59e0b' }}>●</span>
    ) : (
      <span style={{ color: '#9ca3af' }}>●</span>
    )

  let label: string
  if (data.status === 'empty') {
    label = 'Отправка писем: очередь пуста'
  } else if (data.status === 'ready') {
    label = `Отправка писем: готово · ${data.count} запланированы`
  } else {
    label = `Отправка писем: ожидание · ${data.count} запланированы · отправка через ${minutesUntil(data.sendAt)} мин`
  }

  return (
    <span style={WIDGET_STYLE}>
      {dot}
      <span>{label}</span>
    </span>
  )
}
