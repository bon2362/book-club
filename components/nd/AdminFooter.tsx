'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import AdminStatusBar from './AdminStatusBar'
import DigestStatusWidget from './DigestStatusWidget'
import AllureWidget from './AllureWidget'

interface AdminFooterProps {
  buildTime: string | null
  commitSha: string | null
  shortSha: string | null
  commitMsg: string | null
}

const FOOTER_STYLE: React.CSSProperties = {
  borderTop: '1px solid #E5E5E5',
  padding: '1rem 1.5rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
}

const META_ROW_STYLE: React.CSSProperties = {
  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
  fontSize: '0.7rem',
  color: '#999',
  display: 'flex',
  flexWrap: 'wrap',
  gap: '0.4rem 1rem',
  alignItems: 'center',
}

const LINK_STYLE: React.CSSProperties = {
  color: '#555',
  fontFamily: 'monospace',
  textDecoration: 'none',
  borderBottom: '1px solid #ccc',
}

const BUTTON_STYLE: React.CSSProperties = {
  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
  fontSize: '0.68rem',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: '#222',
  background: '#fff',
  border: '1px solid #111',
  cursor: 'pointer',
  padding: '0.35rem 0.55rem',
}

export default function AdminFooter({
  buildTime,
  commitSha,
  shortSha,
  commitMsg,
}: AdminFooterProps) {
  const router = useRouter()
  const [refreshSignal, setRefreshSignal] = useState(0)

  function refreshWidgets() {
    setRefreshSignal(signal => signal + 1)
    router.refresh()
  }

  return (
    <footer style={FOOTER_STYLE}>
      <div style={META_ROW_STYLE}>
        {buildTime && <span>Деплой: <b style={{ color: '#555' }}>{buildTime} CET</b></span>}
        {shortSha && commitSha && (
          <span>Коммит:{' '}
            <a
              href={`https://github.com/bon2362/book-club/commit/${commitSha}`}
              target="_blank"
              rel="noopener noreferrer"
              style={LINK_STYLE}
            >
              {shortSha}
            </a>
          </span>
        )}
        {commitMsg && <span style={{ color: '#777' }}>{commitMsg}</span>}
        <button
          type="button"
          onClick={refreshWidgets}
          style={BUTTON_STYLE}
          title="Обновить данные всех виджетов подвала"
        >
          Обновить виджеты
        </button>
      </div>
      <AdminStatusBar refreshSignal={refreshSignal} />
      <DigestStatusWidget refreshSignal={refreshSignal} />
      <AllureWidget refreshSignal={refreshSignal} />
    </footer>
  )
}
