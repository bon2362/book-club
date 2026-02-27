'use client'

import { useState } from 'react'
import type { UserSignup } from '@/lib/signups'
import type { BookWithCover } from '@/lib/books-with-covers'
import Header from './Header'

interface BookEntry {
  book: BookWithCover
  users: UserSignup[]
}

interface Props {
  users: UserSignup[]
  byBook: BookEntry[]
  statuses: Record<string, 'reading' | 'read'>
}

type View = 'users' | 'books'

const cell: React.CSSProperties = {
  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
  fontSize: '0.8rem',
  color: '#111',
  padding: '0.5rem 0.75rem',
  borderBottom: '1px solid #E5E5E5',
  verticalAlign: 'top',
}

const headCell: React.CSSProperties = {
  ...cell,
  fontWeight: 700,
  fontSize: '0.65rem',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: '#666',
  borderBottom: '2px solid #111',
}

export default function AdminPanel({ users, byBook, statuses: initialStatuses }: Props) {
  const [view, setView] = useState<View>('users')
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [statuses, setStatuses] = useState<Record<string, 'reading' | 'read'>>(initialStatuses)
  const [statusLoading, setStatusLoading] = useState<string | null>(null)

  async function handleSync() {
    setSyncing(true)
    setSyncMsg('')
    try {
      const res = await fetch('/api/sync', { method: 'POST' })
      setSyncMsg(res.ok ? 'Синхронизировано' : 'Ошибка синхронизации')
    } catch {
      setSyncMsg('Ошибка синхронизации')
    } finally {
      setSyncing(false)
    }
  }

  async function setBookStatus(bookId: string, status: 'reading' | 'read') {
    setStatusLoading(bookId)
    try {
      await fetch('/api/admin/book-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId, status }),
      })
      setStatuses(prev => ({ ...prev, [bookId]: status }))
    } finally {
      setStatusLoading(null)
    }
  }

  async function resetBookStatus(bookId: string) {
    setStatusLoading(bookId)
    try {
      await fetch(`/api/admin/book-status?bookId=${encodeURIComponent(bookId)}`, { method: 'DELETE' })
      setStatuses(prev => {
        const next = { ...prev }
        delete next[bookId]
        return next
      })
    } finally {
      setStatusLoading(null)
    }
  }

  const tabStyle = (active: boolean): React.CSSProperties => ({
    fontFamily: 'var(--nd-sans), system-ui, sans-serif',
    fontSize: '0.7rem',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    padding: '0.4rem 0',
    background: 'none',
    border: 'none',
    borderBottom: active ? '2px solid #111' : '2px solid transparent',
    color: active ? '#111' : '#999',
    cursor: 'pointer',
    marginRight: '1.5rem',
  })

  const btnStyle = (active: boolean, color: string): React.CSSProperties => ({
    fontFamily: 'var(--nd-sans), system-ui, sans-serif',
    fontSize: '0.65rem',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    padding: '0.2rem 0.5rem',
    border: `1px solid ${color}`,
    background: active ? color : 'transparent',
    color: active ? '#fff' : color,
    cursor: 'pointer',
    marginRight: '0.375rem',
  })

  // We want all books, not just those with signups
  // byBook only contains books with signups — we need all books
  // We'll use a combined set: all byBook books + render status controls there
  return (
    <>
      <Header />
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem' }}>
        {/* Title row */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1.5rem' }}>
          <h1 style={{ fontFamily: 'var(--nd-serif), Georgia, serif', fontWeight: 700, fontSize: '1.5rem', color: '#111', margin: 0 }}>
            Панель администратора
          </h1>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            {syncMsg && (
              <span style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.75rem', color: '#666' }}>
                {syncMsg}
              </span>
            )}
            <button
              onClick={handleSync}
              disabled={syncing}
              style={{
                fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                fontSize: '0.7rem',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                padding: '0.4rem 0.875rem',
                border: '1px solid #111',
                background: syncing ? '#E5E5E5' : 'transparent',
                color: syncing ? '#999' : '#111',
                cursor: syncing ? 'default' : 'pointer',
              }}
            >
              {syncing ? 'Синхронизация…' : 'Sync'}
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ borderBottom: '1px solid #E5E5E5', marginBottom: '1.5rem' }}>
          <button style={tabStyle(view === 'users')} onClick={() => setView('users')}>
            Участники ({users.length})
          </button>
          <button style={tabStyle(view === 'books')} onClick={() => setView('books')}>
            По книгам ({byBook.length})
          </button>
        </div>

        {/* Users table */}
        {view === 'users' && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={headCell}>Имя</th>
                <th style={headCell}>Telegram</th>
                <th style={headCell}>Email</th>
                <th style={headCell}>Книги</th>
              </tr>
            </thead>
            <tbody>
              {users.map(u => (
                <tr key={u.userId}>
                  <td style={cell}>{u.name}</td>
                  <td style={cell}>{u.contacts}</td>
                  <td style={{ ...cell, color: '#666' }}>{u.email}</td>
                  <td style={cell}>{u.selectedBooks.join(', ')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Books table */}
        {view === 'books' && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={headCell}>Книга</th>
                <th style={headCell}>Автор</th>
                <th style={{ ...headCell, textAlign: 'right' }}>Записались</th>
                <th style={headCell}>Участники</th>
                <th style={headCell}>Статус</th>
              </tr>
            </thead>
            <tbody>
              {byBook.map(({ book, users: bookUsers }) => {
                const currentStatus = statuses[book.id]
                const isLoading = statusLoading === book.id
                return (
                  <tr key={book.id}>
                    <td style={cell}>{book.name}</td>
                    <td style={{ ...cell, color: '#666', fontStyle: 'italic' }}>{book.author}</td>
                    <td style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>{bookUsers.length}</td>
                    <td style={{ ...cell, color: '#666' }}>{bookUsers.map(u => u.name).join(', ')}</td>
                    <td style={cell}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                        <button
                          disabled={isLoading}
                          onClick={() => setBookStatus(book.id, 'reading')}
                          style={btnStyle(currentStatus === 'reading', '#C0603A')}
                        >
                          Читаем
                        </button>
                        <button
                          disabled={isLoading}
                          onClick={() => setBookStatus(book.id, 'read')}
                          style={btnStyle(currentStatus === 'read', '#666')}
                        >
                          Прочитано
                        </button>
                        {currentStatus && (
                          <button
                            disabled={isLoading}
                            onClick={() => resetBookStatus(book.id)}
                            style={btnStyle(false, '#999')}
                          >
                            Сброс
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </main>
    </>
  )
}
