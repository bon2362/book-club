'use client'

import { useEffect, useState, useCallback } from 'react'
import { useVisibleInterval } from './use-visible-interval'

interface NeonUsage {
  cuHours: number
  estSpendUsd: number
  spendLimitUsd: number
  periodStart: string
}

interface NeonUsageWidgetProps {
  refreshSignal?: number
}

const VERCEL_USAGE_URL = 'https://vercel.com/bon2362-5067s-projects/~/usage'

const ROW_STYLE: React.CSSProperties = {
  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
  fontSize: '0.7rem',
  color: 'var(--text-muted)',
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'center',
  gap: '0.3rem 0.6rem',
}

const BAR_STYLE: React.CSSProperties = {
  display: 'inline-block',
  width: '80px',
  height: '4px',
  background: 'var(--border)',
  position: 'relative',
}

const LINK_STYLE: React.CSSProperties = {
  color: 'var(--text-secondary)',
  textDecoration: 'none',
  borderBottom: '1px solid var(--border)',
}

function fmtDay(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getUTCDate()).padStart(2, '0')}.${String(d.getUTCMonth() + 1).padStart(2, '0')}`
}

export default function NeonUsageWidget({ refreshSignal = 0 }: NeonUsageWidgetProps) {
  const [data, setData] = useState<NeonUsage | null>(null)

  const fetchUsage = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/neon-usage')
      if (res.ok) setData(await res.json())
    } catch {
      // тихо игнорируем — виджет остаётся с прошлым значением
    }
  }, [])

  // Данные Neon и так отстают на ~час, поэтому опрашиваем редко — раз в 5 минут,
  // и только при активной вкладке (не крутить внешний API из фона).
  useVisibleInterval(fetchUsage, 300_000)

  // Ручной рефреш по кнопке в AdminFooter.
  useEffect(() => {
    if (refreshSignal > 0) fetchUsage()
  }, [refreshSignal, fetchUsage])

  if (!data) return null

  const pct = data.spendLimitUsd > 0
    ? Math.min(100, Math.round((data.estSpendUsd / data.spendLimitUsd) * 100))
    : 0
  const color =
    pct >= 100 ? 'var(--status-error, #c0392b)'
    : pct >= 80 ? 'var(--status-warn)'
    : 'var(--status-ok)'

  return (
    <div style={ROW_STYLE}>
      <span style={{ color }}>●</span>
      <span>
        Neon: <b style={{ color: 'var(--text-secondary)' }}>{data.cuHours} CU-час</b>
        {' · '}~${data.estSpendUsd.toFixed(2)} / ${data.spendLimitUsd}
      </span>
      <span style={BAR_STYLE} aria-hidden>
        <span style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: color }} />
      </span>
      <span style={{ opacity: 0.7 }}>с {fmtDay(data.periodStart)}</span>
      <a href={VERCEL_USAGE_URL} target="_blank" rel="noopener noreferrer" style={LINK_STYLE}>
        Vercel Usage ↗
      </a>
    </div>
  )
}
