'use client'

import { useEffect, useState, useCallback } from 'react'

interface CiStatus {
  status: string
  conclusion: string | null
  name: string
  sha: string
  branch: string
  url: string
  createdAt: string
}

interface DeployStatus {
  state: string
  url: string
  sha: string | null
  createdAt: number
}

interface StatusData {
  ci: CiStatus | null
  deploy: DeployStatus | null
}

function timeAgo(dateInput: string | number): string {
  const date = typeof dateInput === 'number' ? new Date(dateInput) : new Date(dateInput)
  const diff = Math.floor((Date.now() - date.getTime()) / 1000)
  if (diff < 60) return `${diff}с назад`
  if (diff < 3600) return `${Math.floor(diff / 60)}м назад`
  if (diff < 86400) return `${Math.floor(diff / 3600)}ч назад`
  return `${Math.floor(diff / 86400)}д назад`
}

function CiDot({ status, conclusion }: { status: string; conclusion: string | null }) {
  if (status === 'in_progress' || status === 'queued') {
    return <span style={{ color: '#f59e0b' }}>●</span>
  }
  if (conclusion === 'success') return <span style={{ color: '#22c55e' }}>●</span>
  if (conclusion === 'failure') return <span style={{ color: '#ef4444' }}>●</span>
  return <span style={{ color: '#9ca3af' }}>●</span>
}

function DeployDot({ state }: { state: string }) {
  if (state === 'READY') return <span style={{ color: '#22c55e' }}>●</span>
  if (state === 'ERROR' || state === 'CANCELED') return <span style={{ color: '#ef4444' }}>●</span>
  if (state === 'BUILDING' || state === 'INITIALIZING' || state === 'QUEUED') {
    return <span style={{ color: '#f59e0b' }}>●</span>
  }
  return <span style={{ color: '#9ca3af' }}>●</span>
}

const BASE_STYLE: React.CSSProperties = {
  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
  fontSize: '0.7rem',
  color: '#999',
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.4rem 1.5rem',
  alignItems: 'center',
}

const LINK_STYLE: React.CSSProperties = {
  color: '#555',
  fontFamily: 'monospace',
  textDecoration: 'none',
  borderBottom: '1px solid #ccc',
}

export default function AdminStatusBar() {
  const [data, setData] = useState<StatusData | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/status')
      if (res.ok) setData(await res.json())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchStatus()
    const id = setInterval(fetchStatus, 60_000)
    return () => clearInterval(id)
  }, [fetchStatus])

  if (loading) {
    return <div style={BASE_STYLE}><span style={{ color: '#bbb' }}>загрузка статусов…</span></div>
  }

  if (!data) return null

  const { ci, deploy } = data

  return (
    <div style={BASE_STYLE}>
      {ci && (
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <CiDot status={ci.status} conclusion={ci.conclusion} />
          <span>CI:</span>
          <a href={ci.url} target="_blank" rel="noopener noreferrer" style={LINK_STYLE}>
            {ci.name}
          </a>
          <span>·</span>
          <span style={{ color: '#777' }}>{ci.branch}</span>
          <span>·</span>
          <a
            href={`https://github.com/bon2362/book-club/commit/${ci.sha}`}
            target="_blank"
            rel="noopener noreferrer"
            style={LINK_STYLE}
          >
            {ci.sha}
          </a>
          <span>·</span>
          <span>{timeAgo(ci.createdAt)}</span>
        </span>
      )}
      {deploy && (
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
          <DeployDot state={deploy.state} />
          <span>Vercel:</span>
          <a
            href={`https://${deploy.url}`}
            target="_blank"
            rel="noopener noreferrer"
            style={LINK_STYLE}
          >
            {deploy.state}
          </a>
          {deploy.sha && (
            <>
              <span>·</span>
              <a
                href={`https://github.com/bon2362/book-club/commit/${deploy.sha}`}
                target="_blank"
                rel="noopener noreferrer"
                style={LINK_STYLE}
              >
                {deploy.sha}
              </a>
            </>
          )}
          <span>·</span>
          <span>{timeAgo(deploy.createdAt)}</span>
        </span>
      )}
      {!ci && !deploy && (
        <span style={{ color: '#bbb' }}>статусы недоступны</span>
      )}
    </div>
  )
}
