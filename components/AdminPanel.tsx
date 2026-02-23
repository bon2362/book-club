'use client'

import { useState, useEffect, useCallback } from 'react'
import type { UserSignup } from '@/lib/signups'
import type { Book } from '@/lib/sheets'

interface Props {
  users: UserSignup[]
  byBook: { book: Book; users: UserSignup[] }[]
}

type Tab = 'users' | 'books'
type SyncState = 'idle' | 'loading' | 'success' | 'error'

interface SyncResult {
  state: SyncState
  message: string
}

// Shared style tokens — CSS variables that switch with the theme
const COLORS = {
  parchment: 'var(--bg)',
  parchmentDark: 'var(--bg-elevated)',
  nearBlack: 'var(--text)',
  terracotta: 'var(--accent)',
  terracottaDark: 'var(--accent-hover)',
  forestGreen: 'var(--success)',
  mutedBrown: 'var(--text-muted)',
  warmBrown: 'var(--text-secondary)',
  borderLight: 'var(--border-subtle)',
  borderMid: 'var(--border)',
}

const serif = "'Playfair Display', 'Georgia', 'Times New Roman', serif"
const serifBody = "'Georgia', serif"

export default function AdminPanel({ users, byBook }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('users')
  const [syncResult, setSyncResult] = useState<SyncResult>({ state: 'idle', message: '' })

  // Auto-dismiss sync feedback after 3 seconds
  useEffect(() => {
    if (syncResult.state === 'success' || syncResult.state === 'error') {
      const timer = setTimeout(() => {
        setSyncResult({ state: 'idle', message: '' })
      }, 3000)
      return () => clearTimeout(timer)
    }
  }, [syncResult.state])

  const handleSync = useCallback(async () => {
    setSyncResult({ state: 'loading', message: '' })
    try {
      const res = await fetch('/api/sync', { method: 'POST' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json() as { ok: boolean; count: number }
      setSyncResult({
        state: 'success',
        message: `Синхронизировано: ${data.count} книг`,
      })
    } catch {
      setSyncResult({ state: 'error', message: 'Ошибка синхронизации' })
    }
  }, [])

  const isSyncing = syncResult.state === 'loading'
  const showFeedback = syncResult.state === 'success' || syncResult.state === 'error'

  return (
    <div
      style={{
        minHeight: '100vh',
        background: COLORS.parchment,
        fontFamily: serif,
      }}
    >
      {/* ── Header ── */}
      <header
        style={{
          borderBottom: `2px solid ${COLORS.nearBlack}`,
          background: COLORS.parchment,
          position: 'sticky',
          top: 0,
          zIndex: 100,
          boxShadow: '0 2px 8px rgba(26,23,20,0.08)',
        }}
      >
        <div
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            padding: '0 1.5rem',
            height: '64px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '1rem',
          }}
        >
          {/* Title group */}
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.875rem' }}>
            <span
              style={{
                fontFamily: serif,
                fontWeight: 700,
                fontSize: '1.375rem',
                letterSpacing: '-0.02em',
                color: COLORS.nearBlack,
                lineHeight: 1,
              }}
            >
              Панель администратора
            </span>
            <span
              style={{
                fontFamily: serifBody,
                fontStyle: 'italic',
                fontSize: '0.75rem',
                color: COLORS.mutedBrown,
                letterSpacing: '0.02em',
              }}
            >
              Книжный клуб
            </span>
          </div>

          {/* Sync button + feedback */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            {/* Sync feedback toast */}
            {showFeedback && (
              <span
                style={{
                  fontFamily: serifBody,
                  fontStyle: 'italic',
                  fontSize: '0.8125rem',
                  color: syncResult.state === 'success' ? COLORS.forestGreen : COLORS.terracotta,
                  letterSpacing: '0.01em',
                  borderLeft: `2px solid ${syncResult.state === 'success' ? COLORS.forestGreen : COLORS.terracotta}`,
                  paddingLeft: '0.625rem',
                  animation: 'fadeIn 0.2s ease',
                }}
              >
                {syncResult.message}
              </span>
            )}

            <button
              onClick={handleSync}
              disabled={isSyncing}
              style={{
                fontFamily: serifBody,
                fontSize: '0.6875rem',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: isSyncing ? COLORS.mutedBrown : COLORS.terracotta,
                background: 'transparent',
                border: `1px solid ${isSyncing ? COLORS.mutedBrown : COLORS.terracotta}`,
                padding: '0.4rem 0.9rem',
                cursor: isSyncing ? 'not-allowed' : 'pointer',
                transition: 'background 0.15s, color 0.15s, border-color 0.15s',
                whiteSpace: 'nowrap',
                opacity: isSyncing ? 0.6 : 1,
              }}
              onMouseEnter={e => {
                if (isSyncing) return
                const btn = e.currentTarget as HTMLButtonElement
                btn.style.background = COLORS.terracotta
                btn.style.color = COLORS.parchment
              }}
              onMouseLeave={e => {
                if (isSyncing) return
                const btn = e.currentTarget as HTMLButtonElement
                btn.style.background = 'transparent'
                btn.style.color = COLORS.terracotta
              }}
            >
              {isSyncing ? '⟳ Синхронизация…' : '↻ Синхронизировать'}
            </button>
          </div>
        </div>
      </header>

      {/* ── Main ── */}
      <main
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '2rem 1.5rem 5rem',
        }}
      >
        {/* ── Stats row ── */}
        <div
          style={{
            display: 'flex',
            gap: '2rem',
            marginBottom: '2rem',
            paddingBottom: '1.5rem',
            borderBottom: `1px solid ${COLORS.borderLight}`,
          }}
        >
          <StatPill label="Участников" value={users.length} color={COLORS.terracotta} />
          <StatPill label="Книг с записями" value={byBook.length} color={COLORS.forestGreen} />
          <StatPill
            label="Всего записей"
            value={users.reduce((s, u) => s + u.selectedBooks.length, 0)}
            color={COLORS.warmBrown}
          />
        </div>

        {/* ── Tabs ── */}
        <div
          role="tablist"
          style={{
            display: 'flex',
            gap: 0,
            marginBottom: '2rem',
            borderBottom: `2px solid ${COLORS.borderLight}`,
          }}
        >
          <TabButton
            label={`👥 Пользователи (${users.length})`}
            isActive={activeTab === 'users'}
            onClick={() => setActiveTab('users')}
          />
          <TabButton
            label={`📚 По книгам (${byBook.length})`}
            isActive={activeTab === 'books'}
            onClick={() => setActiveTab('books')}
          />
        </div>

        {/* ── View: Users ── */}
        {activeTab === 'users' && (
          <div>
            {users.length === 0 ? (
              <EmptyState message="Пока никто не зарегистрировался" />
            ) : (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
                  gap: '1.25rem',
                }}
              >
                {users.map(user => (
                  <UserCard key={user.userId} user={user} />
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── View: By Book ── */}
        {activeTab === 'books' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {byBook.length === 0 ? (
              <EmptyState message="Ни одной книги с записями" />
            ) : (
              byBook.map(({ book, users: bookUsers }) => (
                <BookSection key={book.id} book={book} users={bookUsers} />
              ))
            )}
          </div>
        )}
      </main>

      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateX(6px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  )
}

// ── Sub-components ──────────────────────────────────────────────────────────

function StatPill({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
      <span
        style={{
          fontFamily: serifBody,
          fontSize: '0.6rem',
          letterSpacing: '0.12em',
          textTransform: 'uppercase',
          color: COLORS.mutedBrown,
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontFamily: serif,
          fontWeight: 700,
          fontSize: '1.75rem',
          color,
          letterSpacing: '-0.03em',
          lineHeight: 1,
        }}
      >
        {value}
      </span>
    </div>
  )
}

function TabButton({
  label,
  isActive,
  onClick,
}: {
  label: string
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      role="tab"
      aria-selected={isActive}
      onClick={onClick}
      style={{
        fontFamily: serifBody,
        fontSize: '0.8125rem',
        letterSpacing: '0.04em',
        color: isActive ? COLORS.nearBlack : COLORS.mutedBrown,
        background: 'transparent',
        border: 'none',
        borderBottom: isActive
          ? `3px solid ${COLORS.terracotta}`
          : '3px solid transparent',
        padding: '0.625rem 1.25rem',
        cursor: 'pointer',
        marginBottom: '-2px', // overlap parent border
        transition: 'color 0.15s, border-color 0.15s',
        fontWeight: isActive ? 600 : 400,
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  )
}

function UserCard({ user }: { user: UserSignup }) {
  return (
    <article
      style={{
        background: COLORS.parchment,
        borderLeft: `4px solid ${COLORS.terracotta}`,
        boxShadow: `3px 3px 0 ${COLORS.terracotta}18, 0 1px 4px rgba(0,0,0,0.06)`,
        padding: '1.25rem 1.25rem 1rem 1.125rem',
      }}
    >
      {/* Name + email */}
      <div style={{ marginBottom: '0.625rem' }}>
        <p
          style={{
            fontFamily: serif,
            fontWeight: 700,
            fontSize: '1.0625rem',
            color: COLORS.nearBlack,
            margin: '0 0 0.125rem 0',
            letterSpacing: '-0.01em',
            lineHeight: 1.25,
          }}
        >
          {user.name || '—'}
        </p>
        <p
          style={{
            fontFamily: serifBody,
            fontSize: '0.8125rem',
            color: COLORS.warmBrown,
            margin: 0,
            letterSpacing: '0.01em',
          }}
        >
          {user.email}
        </p>
      </div>

      {/* Contacts */}
      {user.contacts && (
        <p
          style={{
            fontFamily: serifBody,
            fontStyle: 'italic',
            fontSize: '0.8125rem',
            color: COLORS.mutedBrown,
            margin: '0 0 0.875rem 0',
            borderTop: `1px solid ${COLORS.borderLight}`,
            paddingTop: '0.5rem',
            letterSpacing: '0.01em',
          }}
        >
          {user.contacts}
        </p>
      )}

      {/* Selected books as tags */}
      {user.selectedBooks.length > 0 ? (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.375rem',
            borderTop: user.contacts ? 'none' : `1px solid ${COLORS.borderLight}`,
            paddingTop: user.contacts ? 0 : '0.5rem',
          }}
        >
          {user.selectedBooks.map(bookName => (
            <span
              key={bookName}
              style={{
                fontFamily: serifBody,
                fontSize: '0.625rem',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: COLORS.forestGreen,
                background: 'var(--bg-tag-green)',
                border: `1px solid ${COLORS.forestGreen}33`,
                padding: '0.2rem 0.55rem',
              }}
            >
              {bookName}
            </span>
          ))}
        </div>
      ) : (
        <p
          style={{
            fontFamily: serifBody,
            fontStyle: 'italic',
            fontSize: '0.75rem',
            color: COLORS.borderMid,
            margin: 0,
            borderTop: `1px solid ${COLORS.borderLight}`,
            paddingTop: '0.5rem',
          }}
        >
          нет выбранных книг
        </p>
      )}
    </article>
  )
}

function BookSection({
  book,
  users,
}: {
  book: Book
  users: UserSignup[]
}) {
  return (
    <section
      style={{
        borderLeft: `4px solid ${COLORS.forestGreen}`,
        paddingLeft: '1.25rem',
      }}
    >
      {/* Book header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          gap: '0.875rem',
          marginBottom: '0.875rem',
        }}
      >
        <h2
          style={{
            fontFamily: serif,
            fontWeight: 700,
            fontSize: '1.125rem',
            color: COLORS.nearBlack,
            margin: 0,
            letterSpacing: '-0.01em',
            lineHeight: 1.3,
          }}
        >
          {book.name}
        </h2>
        {book.author && (
          <span
            style={{
              fontFamily: serifBody,
              fontStyle: 'italic',
              fontSize: '0.8125rem',
              color: COLORS.mutedBrown,
            }}
          >
            {book.author}
          </span>
        )}
        <span
          style={{
            fontFamily: serifBody,
            fontSize: '0.675rem',
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            color: COLORS.forestGreen,
            fontWeight: 600,
            marginLeft: 'auto',
            flexShrink: 0,
          }}
        >
          {users.length} {users.length === 1 ? 'участник' : users.length < 5 ? 'участника' : 'участников'}
        </span>
      </div>

      {/* User list */}
      <ul
        style={{
          listStyle: 'none',
          margin: 0,
          padding: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: '0.375rem',
        }}
      >
        {users.map(user => (
          <li
            key={user.userId}
            style={{
              fontFamily: serifBody,
              fontSize: '0.875rem',
              color: COLORS.warmBrown,
              display: 'flex',
              alignItems: 'baseline',
              gap: '0.5rem',
              lineHeight: 1.5,
            }}
          >
            <span
              style={{
                color: COLORS.forestGreen,
                fontSize: '0.75rem',
                flexShrink: 0,
              }}
              aria-hidden
            >
              •
            </span>
            <span>
              <span style={{ fontWeight: 600, color: COLORS.nearBlack }}>
                {user.name || user.email}
              </span>
              {user.contacts && (
                <>
                  <span style={{ color: COLORS.mutedBrown, margin: '0 0.375rem' }}>—</span>
                  <span style={{ fontStyle: 'italic', color: COLORS.mutedBrown }}>
                    {user.contacts}
                  </span>
                </>
              )}
            </span>
          </li>
        ))}
      </ul>

      {/* Divider */}
      <div
        style={{
          marginTop: '1.25rem',
          borderBottom: `1px solid ${COLORS.borderLight}`,
        }}
      />
    </section>
  )
}

function EmptyState({ message }: { message: string }) {
  return (
    <div
      style={{
        textAlign: 'center',
        padding: '4rem 2rem',
        borderTop: `1px solid ${COLORS.borderLight}`,
      }}
    >
      <div
        aria-hidden
        style={{
          fontFamily: serifBody,
          fontSize: '1.75rem',
          color: COLORS.borderMid,
          marginBottom: '1rem',
          letterSpacing: '0.5em',
        }}
      >
        ✦ ✦ ✦
      </div>
      <p
        style={{
          fontFamily: serif,
          fontWeight: 700,
          fontSize: '1.125rem',
          color: COLORS.nearBlack,
          margin: '0 0 0.375rem 0',
          letterSpacing: '-0.01em',
        }}
      >
        {message}
      </p>
    </div>
  )
}

