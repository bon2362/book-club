'use client'

import { useEffect, useState, useCallback } from 'react'

interface AllureSummary {
  statistic: {
    passed: number
    failed: number
    broken: number
    skipped: number
    total: number
  }
  time: {
    stop: number
  }
}

function timeAgo(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000)
  if (diff < 60) return `${diff}с назад`
  if (diff < 3600) return `${Math.floor(diff / 60)}м назад`
  if (diff < 86400) return `${Math.floor(diff / 3600)}ч назад`
  return `${Math.floor(diff / 86400)}д назад`
}

function progressBar(passed: number, total: number): string {
  if (total === 0) return ''
  const filled = Math.round((passed / total) * 12)
  return '█'.repeat(filled) + '░'.repeat(12 - filled)
}

const WIDGET_STYLE: React.CSSProperties = {
  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
  fontSize: '0.7rem',
  color: '#999',
  display: 'flex',
  alignItems: 'center',
  gap: '0.3rem',
}

const LINK_STYLE: React.CSSProperties = {
  color: '#555',
  textDecoration: 'none',
  borderBottom: '1px solid #ccc',
}

const MONO_STYLE: React.CSSProperties = {
  fontFamily: 'monospace',
  color: '#777',
}

export default function AllureWidget() {
  const [data, setData] = useState<AllureSummary | null>(null)
  const [error, setError] = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(
        'https://bon2362.github.io/book-club/widgets/summary.json',
        { cache: 'no-store' }
      )
      if (res.ok) {
        setData(await res.json())
        setError(false)
      } else {
        setError(true)
      }
    } catch {
      setError(true)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const id = setInterval(fetchData, 60_000)
    return () => clearInterval(id)
  }, [fetchData])

  if (error) return null
  if (!data) return null

  const { passed, failed, broken, skipped, total } = data.statistic
  const allGood = failed === 0 && broken === 0
  const dot = allGood
    ? <span style={{ color: '#22c55e' }}>●</span>
    : <span style={{ color: '#ef4444' }}>●</span>

  const bar = progressBar(passed, total)
  const issues = [
    failed > 0 && `${failed} failed`,
    broken > 0 && `${broken} broken`,
    skipped > 0 && `${skipped} skipped`,
  ].filter(Boolean).join(' · ')

  return (
    <span style={WIDGET_STYLE}>
      {dot}
      <span>Allure:</span>
      <span style={MONO_STYLE}>[{bar}]</span>
      <span style={{ color: '#555' }}>{passed}/{total}</span>
      {issues && <><span>·</span><span style={{ color: allGood ? '#999' : '#ef4444' }}>{issues}</span></>}
      <span>·</span>
      <span>{timeAgo(data.time.stop)}</span>
      <span>·</span>
      <a
        href="https://bon2362.github.io/book-club/"
        target="_blank"
        rel="noopener noreferrer"
        style={LINK_STYLE}
      >
        отчёт ↗
      </a>
    </span>
  )
}
