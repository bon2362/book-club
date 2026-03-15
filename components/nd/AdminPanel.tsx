'use client'

import { useState, useEffect, Fragment } from 'react'
import type { UserSignup } from '@/lib/signups'
import type { BookWithCover } from '@/lib/books-with-covers'
import Header from './Header'

interface Submission {
  id: string
  userId: string
  userEmail: string | null
  title: string
  author: string
  topic: string | null
  pages: number | null
  publishedDate: string | null
  textUrl: string | null
  description: string | null
  coverUrl: string | null
  whyRead: string
  status: string
  rejectionReason: string | null
  createdAt: string
  updatedAt: string
}

interface BookEntry {
  book: BookWithCover
  users: UserSignup[]
}

interface Props {
  users: UserSignup[]
  byBook: BookEntry[]
  statuses: Record<string, 'reading' | 'read'>
  allTags: string[]
  tagDescriptions: Record<string, string>
  newFlags: Record<string, boolean>
}

type View = 'users' | 'books' | 'tags' | 'submissions'
type SubmissionFilter = 'all' | 'pending' | 'approved' | 'rejected'

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

const fieldLabel: React.CSSProperties = {
  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
  fontSize: '0.65rem',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  color: '#666',
  marginBottom: '0.25rem',
}

const fieldInput: React.CSSProperties = {
  display: 'block',
  width: '100%',
  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
  fontSize: '0.8rem',
  color: '#111',
  borderTop: '1px solid #E5E5E5',
  borderRight: '1px solid #E5E5E5',
  borderLeft: '1px solid #E5E5E5',
  borderBottom: '2px solid #111',
  padding: '0.35rem 0.5rem',
  outline: 'none',
  background: '#fff',
  boxSizing: 'border-box',
}

export default function AdminPanel({ users, byBook, statuses: initialStatuses, allTags, tagDescriptions: initialTagDescriptions, newFlags: initialNewFlags }: Props) {
  const [localUsers, setLocalUsers] = useState<UserSignup[]>(users)
  const [view, setView] = useState<View>('users')
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')
  const [statuses, setStatuses] = useState<Record<string, 'reading' | 'read'>>(initialStatuses)
  const [statusLoading, setStatusLoading] = useState<string | null>(null)
  const [tagDescEdits, setTagDescEdits] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const tag of allTags) initial[tag] = initialTagDescriptions[tag] ?? ''
    return initial
  })
  const [tagSaving, setTagSaving] = useState<string | null>(null)
  const [tagSavedSet, setTagSavedSet] = useState<Set<string>>(new Set())

  const [newFlags, setNewFlags] = useState<Record<string, boolean>>(initialNewFlags)
  const [newFlagLoading, setNewFlagLoading] = useState<string | null>(null)

  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [submissionsLoaded, setSubmissionsLoaded] = useState(false)
  const [submissionFilter, setSubmissionFilter] = useState<SubmissionFilter>('pending')
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null)
  const [submissionEdits, setSubmissionEdits] = useState<Record<string, Partial<Submission>>>({})
  const [submissionActionLoading, setSubmissionActionLoading] = useState<string | null>(null)
  const [submissionDeleteConfirm, setSubmissionDeleteConfirm] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/submissions')
      .then(r => r.json())
      .then(d => { if (d.success) setSubmissions(d.data) })
      .catch(() => {})
      .finally(() => setSubmissionsLoaded(true))
  }, [])

  async function handleDeleteUser(userId: string, userName: string) {
    if (!window.confirm(`Удалить пользователя ${userName}? Это действие необратимо.`)) return
    try {
      const res = await fetch('/api/admin/delete-user', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      if (!res.ok) return
      setLocalUsers(prev => prev.filter(u => u.userId !== userId))
    } catch {
      // silently ignore
    }
  }

  async function handleRemoveBook(userId: string, bookName: string, userName: string) {
    if (!window.confirm(`Снять ${userName} с книги «${bookName}»?`)) return
    try {
      const res = await fetch('/api/admin/remove-book', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, bookName }),
      })
      if (!res.ok) return
      setLocalUsers(prev =>
        prev.map(u => u.userId === userId ? { ...u, selectedBooks: u.selectedBooks.filter(b => b !== bookName) } : u)
      )
    } catch {
      // silently ignore
    }
  }

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

  async function saveTagDescription(tag: string) {
    setTagSaving(tag)
    try {
      await fetch('/api/admin/tag-description', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tag, description: tagDescEdits[tag] ?? '' }),
      })
      setTagSavedSet(prev => new Set(prev).add(tag))
      setTimeout(() => setTagSavedSet(prev => { const next = new Set(prev); next.delete(tag); return next }), 2000)
    } finally {
      setTagSaving(null)
    }
  }

  function updateSubmissionEdit(id: string, field: keyof Submission, value: unknown) {
    setSubmissionEdits(prev => ({ ...prev, [id]: { ...prev[id], [field]: value } }))
  }

  async function handleSaveSubmissionEdits(id: string) {
    const edits = submissionEdits[id]
    if (!edits || Object.keys(edits).length === 0) return
    setSubmissionActionLoading(id)
    try {
      const res = await fetch(`/api/admin/submissions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(edits),
      })
      if (res.ok) {
        const d = await res.json()
        setSubmissions(prev => prev.map(s => s.id === id ? { ...d.data, userEmail: s.userEmail } : s))
        setSubmissionEdits(prev => { const next = { ...prev }; delete next[id]; return next })
      }
    } catch { /* silently ignore */ }
    finally { setSubmissionActionLoading(null) }
  }

  async function handleToggleNew(bookId: string, currentIsNew: boolean) {
    setNewFlagLoading(bookId)
    try {
      const next = !currentIsNew
      await fetch('/api/admin/book-new-flag', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bookId, isNew: next }),
      })
      setNewFlags(prev => ({ ...prev, [bookId]: next }))
    } finally {
      setNewFlagLoading(null)
    }
  }

  async function handleDeleteSubmission(id: string) {
    setSubmissionActionLoading(id)
    try {
      const res = await fetch(`/api/admin/submissions/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setSubmissions(prev => prev.filter(s => s.id !== id))
        setSelectedSubmissionId(null)
        setSubmissionDeleteConfirm(null)
        setSubmissionEdits(prev => { const next = { ...prev }; delete next[id]; return next })
      }
    } catch { /* silently ignore */ }
    finally { setSubmissionActionLoading(null) }
  }

  async function handleSubmissionAction(id: string, status: 'approved' | 'rejected') {
    setSubmissionActionLoading(id)
    try {
      const edits = submissionEdits[id] ?? {}
      const res = await fetch(`/api/admin/submissions/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...edits, status }),
      })
      if (res.ok) {
        const d = await res.json()
        setSubmissions(prev => prev.map(s => s.id === id ? { ...d.data, userEmail: s.userEmail } : s))
        setSelectedSubmissionId(null)
        setSubmissionEdits(prev => { const next = { ...prev }; delete next[id]; return next })
      }
    } catch { /* silently ignore */ }
    finally { setSubmissionActionLoading(null) }
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

  const actionBtnStyle = (color: string, disabled: boolean): React.CSSProperties => ({
    fontFamily: 'var(--nd-sans), system-ui, sans-serif',
    fontSize: '0.65rem',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    padding: '0.3rem 0.75rem',
    border: `1px solid ${disabled ? '#E5E5E5' : color}`,
    background: 'transparent',
    color: disabled ? '#999' : color,
    cursor: disabled ? 'default' : 'pointer',
  })

  const filterBtnStyle = (active: boolean): React.CSSProperties => ({
    fontFamily: 'var(--nd-sans), system-ui, sans-serif',
    fontSize: '0.65rem',
    textTransform: 'uppercase',
    letterSpacing: '0.06em',
    padding: '0.2rem 0.5rem',
    border: '1px solid #999',
    background: active ? '#111' : 'transparent',
    color: active ? '#fff' : '#666',
    cursor: 'pointer',
  })

  const filteredSubmissions = submissionFilter === 'all'
    ? submissions
    : submissions.filter(s => s.status === submissionFilter)

  const submissionStatusLabel: Record<string, string> = { pending: 'На рассмотрении', approved: 'Одобрена', rejected: 'Отклонена' }
  const submissionStatusColor: Record<string, string> = { pending: '#C0603A', approved: '#2E7D32', rejected: '#999' }

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
            Участники ({localUsers.length})
          </button>
          <button style={tabStyle(view === 'books')} onClick={() => setView('books')}>
            По книгам ({byBook.length})
          </button>
          <button style={tabStyle(view === 'tags')} onClick={() => setView('tags')}>
            Теги ({allTags.length})
          </button>
          <button style={tabStyle(view === 'submissions')} onClick={() => setView('submissions')}>
            Заявки ({submissions.length})
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
                <th style={headCell}></th>
              </tr>
            </thead>
            <tbody>
              {localUsers.map(u => (
                <tr key={u.userId}>
                  <td style={cell}>{u.name}</td>
                  <td style={cell}>{u.contacts}</td>
                  <td style={{ ...cell, color: '#666' }}>{u.email}</td>
                  <td style={cell}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                      {u.selectedBooks.map(book => (
                        <span key={book} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.2rem', background: '#F5F5F5', padding: '0.15rem 0.4rem', fontSize: '0.75rem' }}>
                          {book}
                          <button
                            onClick={() => handleRemoveBook(u.userId, book, u.name)}
                            title="Снять с книги"
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#999', fontSize: '0.85rem', lineHeight: 1, padding: '0 0.1rem' }}
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  </td>
                  <td style={{ ...cell, textAlign: 'right' }}>
                    <button
                      onClick={() => handleDeleteUser(u.userId, u.name)}
                      title="Удалить пользователя"
                      style={{ background: 'none', border: '1px solid #E5E5E5', cursor: 'pointer', color: '#999', fontSize: '0.65rem', padding: '0.2rem 0.5rem', fontFamily: 'var(--nd-sans), system-ui, sans-serif', textTransform: 'uppercase', letterSpacing: '0.06em' }}
                    >
                      Удалить
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        {/* Tags editor */}
        {view === 'tags' && (
          <div style={{ maxWidth: '640px' }}>
            {allTags.map(tag => {
              const isSaving = tagSaving === tag
              const isSaved = tagSavedSet.has(tag)
              return (
                <div key={tag} style={{ marginBottom: '1.5rem' }}>
                  <div
                    style={{
                      fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                      fontSize: '0.65rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      color: '#666',
                      marginBottom: '0.4rem',
                    }}
                  >
                    {tag}
                  </div>
                  <textarea
                    value={tagDescEdits[tag] ?? ''}
                    onChange={e => setTagDescEdits(prev => ({ ...prev, [tag]: e.target.value }))}
                    rows={4}
                    placeholder="Описание не задано"
                    style={{
                      display: 'block',
                      width: '100%',
                      fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                      fontSize: '0.8rem',
                      lineHeight: 1.55,
                      color: '#111',
                      border: '1px solid #E5E5E5',
                      borderBottom: '2px solid #111',
                      padding: '0.5rem 0.75rem',
                      resize: 'vertical',
                      outline: 'none',
                      background: '#fff',
                      boxSizing: 'border-box',
                    }}
                  />
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.4rem' }}>
                    <button
                      onClick={() => saveTagDescription(tag)}
                      disabled={isSaving}
                      style={{
                        fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                        fontSize: '0.65rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.08em',
                        padding: '0.3rem 0.75rem',
                        border: '1px solid #111',
                        background: isSaving ? '#E5E5E5' : 'transparent',
                        color: isSaving ? '#999' : '#111',
                        cursor: isSaving ? 'default' : 'pointer',
                      }}
                    >
                      {isSaving ? 'Сохранение…' : 'Сохранить'}
                    </button>
                    {isSaved && (
                      <span style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.7rem', color: '#666' }}>
                        Сохранено
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
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
                <th style={{ ...headCell, textAlign: 'center', width: '80px' }}>Новая</th>
              </tr>
            </thead>
            <tbody>
              {byBook.map(({ book, users: bookUsers }) => {
                const currentStatus = statuses[book.id]
                const isStatusLoading = statusLoading === book.id
                const isSubmission = !book.id.match(/^\d+$/)
                const isNew = newFlags[book.id] ?? book.isNew
                const isFlagLoading = newFlagLoading === book.id
                return (
                  <tr key={book.id}>
                    <td style={cell}>
                      <div>{book.name}</div>
                      <div style={{ fontSize: '0.65rem', color: '#999', marginTop: '0.15rem' }}>
                        {isSubmission ? 'Заявка' : 'Google Sheets'}
                      </div>
                    </td>
                    <td style={{ ...cell, color: '#666', fontStyle: 'italic' }}>{book.author}</td>
                    <td style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>{bookUsers.length}</td>
                    <td style={{ ...cell, color: '#666' }}>{bookUsers.map(u => u.name).join(', ')}</td>
                    <td style={cell}>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem' }}>
                        <button
                          disabled={isStatusLoading}
                          onClick={() => setBookStatus(book.id, 'reading')}
                          style={btnStyle(currentStatus === 'reading', '#C0603A')}
                        >
                          Читаем
                        </button>
                        <button
                          disabled={isStatusLoading}
                          onClick={() => setBookStatus(book.id, 'read')}
                          style={btnStyle(currentStatus === 'read', '#666')}
                        >
                          Прочитано
                        </button>
                        {currentStatus && (
                          <button
                            disabled={isStatusLoading}
                            onClick={() => resetBookStatus(book.id)}
                            style={btnStyle(false, '#999')}
                          >
                            Сброс
                          </button>
                        )}
                      </div>
                    </td>
                    <td style={{ ...cell, textAlign: 'center' }}>
                      <button
                        disabled={isFlagLoading}
                        onClick={() => handleToggleNew(book.id, isNew)}
                        style={{
                          fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                          fontSize: '0.65rem',
                          textTransform: 'uppercase',
                          letterSpacing: '0.06em',
                          padding: '0.2rem 0.6rem',
                          border: `1px solid ${isNew ? '#C0603A' : '#E5E5E5'}`,
                          background: isNew ? '#C0603A' : 'transparent',
                          color: isNew ? '#fff' : '#999',
                          cursor: isFlagLoading ? 'default' : 'pointer',
                          transition: 'background 0.15s, color 0.15s',
                        }}
                      >
                        {isNew ? 'Новая' : '—'}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
        {/* Submissions */}
        {view === 'submissions' && (
          <div>
            {/* Filter */}
            <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
              {(['all', 'pending', 'approved', 'rejected'] as const).map(f => {
                const count = f === 'all' ? submissions.length : submissions.filter(s => s.status === f).length
                const labels = { all: 'Все', pending: 'Ожидают', approved: 'Одобренные', rejected: 'Отклонённые' }
                return (
                  <button key={f} onClick={() => setSubmissionFilter(f)} style={filterBtnStyle(submissionFilter === f)}>
                    {labels[f]} ({count})
                  </button>
                )
              })}
            </div>

            {!submissionsLoaded && <p style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.8rem', color: '#666' }}>Загрузка…</p>}

            {submissionsLoaded && filteredSubmissions.length === 0 && (
              <p style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.8rem', color: '#666' }}>Нет заявок</p>
            )}

            {submissionsLoaded && filteredSubmissions.length > 0 && (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr>
                    <th style={headCell}>Книга</th>
                    <th style={headCell}>Автор</th>
                    <th style={headCell}>Email</th>
                    <th style={headCell}>Статус</th>
                    <th style={headCell}>Дата</th>
                    <th style={headCell}></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredSubmissions.map(sub => {
                    const isSelected = selectedSubmissionId === sub.id
                    const edits = submissionEdits[sub.id] ?? {}
                    const isActing = submissionActionLoading === sub.id
                    const hasEdits = Object.keys(edits).length > 0
                    const statusColor = submissionStatusColor[sub.status] ?? '#111'
                    const statusLabel = submissionStatusLabel[sub.status] ?? sub.status

                    return (
                      <Fragment key={sub.id}>
                        <tr
                          onClick={() => setSelectedSubmissionId(isSelected ? null : sub.id)}
                          style={{ cursor: 'pointer', background: isSelected ? '#FAFAFA' : 'transparent' }}
                        >
                          <td style={cell}>{sub.title}</td>
                          <td style={{ ...cell, fontStyle: 'italic', color: '#666' }}>{sub.author}</td>
                          <td style={{ ...cell, color: '#666' }}>{sub.userEmail ?? '—'}</td>
                          <td style={cell}>
                            <span style={{ color: statusColor, fontWeight: sub.status === 'pending' ? 700 : 400 }}>
                              {statusLabel}
                            </span>
                          </td>
                          <td style={{ ...cell, color: '#999' }}>
                            {new Date(sub.createdAt).toLocaleDateString('ru-RU')}
                          </td>
                          <td style={{ ...cell, textAlign: 'right', color: '#999' }}>
                            {isSelected ? '▲' : '▼'}
                          </td>
                        </tr>
                        {isSelected && (
                          <tr>
                            <td colSpan={6} style={{ padding: '1rem 0.75rem 1.25rem', background: '#FAFAFA', borderBottom: '2px solid #111' }}>
                              <div style={{ display: 'grid', gap: '0.75rem', maxWidth: '720px' }}>
                                <div>
                                  <div style={fieldLabel}>Email автора</div>
                                  <div style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.8rem', color: '#666' }}>
                                    {sub.userEmail ?? '—'}
                                  </div>
                                </div>
                                <div>
                                  <div style={fieldLabel}>Название</div>
                                  <input
                                    value={edits.title ?? sub.title}
                                    onChange={e => updateSubmissionEdit(sub.id, 'title', e.target.value)}
                                    style={fieldInput}
                                  />
                                </div>
                                <div>
                                  <div style={fieldLabel}>Автор</div>
                                  <input
                                    value={edits.author ?? sub.author}
                                    onChange={e => updateSubmissionEdit(sub.id, 'author', e.target.value)}
                                    style={fieldInput}
                                  />
                                </div>
                                <div>
                                  <div style={fieldLabel}>Почему стоит прочитать?</div>
                                  <textarea
                                    value={edits.whyRead ?? sub.whyRead}
                                    onChange={e => updateSubmissionEdit(sub.id, 'whyRead', e.target.value)}
                                    rows={3}
                                    style={{ ...fieldInput, resize: 'vertical' }}
                                  />
                                </div>
                                <div>
                                  <div style={fieldLabel}>Тема</div>
                                  <input
                                    value={edits.topic ?? sub.topic ?? ''}
                                    onChange={e => updateSubmissionEdit(sub.id, 'topic', e.target.value)}
                                    style={fieldInput}
                                  />
                                </div>
                                <div>
                                  <div style={fieldLabel}>Описание</div>
                                  <textarea
                                    value={edits.description ?? sub.description ?? ''}
                                    onChange={e => updateSubmissionEdit(sub.id, 'description', e.target.value)}
                                    rows={3}
                                    style={{ ...fieldInput, resize: 'vertical' }}
                                  />
                                </div>
                                <div>
                                  <div style={fieldLabel}>Ссылка на текст</div>
                                  <input
                                    value={edits.textUrl ?? sub.textUrl ?? ''}
                                    onChange={e => updateSubmissionEdit(sub.id, 'textUrl', e.target.value)}
                                    style={fieldInput}
                                  />
                                </div>
                                <div>
                                  <div style={fieldLabel}>Причина отказа (отправится пользователю в письме)</div>
                                  <textarea
                                    value={edits.rejectionReason ?? sub.rejectionReason ?? ''}
                                    onChange={e => updateSubmissionEdit(sub.id, 'rejectionReason', e.target.value || null)}
                                    rows={2}
                                    placeholder="Необязательно"
                                    style={{ ...fieldInput, resize: 'vertical' }}
                                  />
                                </div>
                                <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginTop: '0.25rem', alignItems: 'center' }}>
                                  {hasEdits && (
                                    <button
                                      onClick={() => handleSaveSubmissionEdits(sub.id)}
                                      disabled={isActing}
                                      style={actionBtnStyle('#111', isActing)}
                                    >
                                      {isActing ? 'Сохранение…' : 'Сохранить'}
                                    </button>
                                  )}
                                  <button
                                    onClick={() => handleSubmissionAction(sub.id, 'approved')}
                                    disabled={isActing || sub.status === 'approved'}
                                    style={actionBtnStyle('#2E7D32', isActing || sub.status === 'approved')}
                                  >
                                    Одобрить
                                  </button>
                                  <button
                                    onClick={() => handleSubmissionAction(sub.id, 'rejected')}
                                    disabled={isActing || sub.status === 'rejected'}
                                    style={actionBtnStyle('#C0603A', isActing || sub.status === 'rejected')}
                                  >
                                    Отклонить
                                  </button>
                                  <span style={{ flex: 1 }} />
                                  {submissionDeleteConfirm === sub.id ? (
                                    <>
                                      <span style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.75rem', color: '#C0603A' }}>
                                        Удалить навсегда?
                                      </span>
                                      <button
                                        onClick={() => handleDeleteSubmission(sub.id)}
                                        disabled={isActing}
                                        style={actionBtnStyle('#C0603A', isActing)}
                                      >
                                        {isActing ? 'Удаление…' : 'Да, удалить'}
                                      </button>
                                      <button
                                        onClick={() => setSubmissionDeleteConfirm(null)}
                                        disabled={isActing}
                                        style={actionBtnStyle('#999', isActing)}
                                      >
                                        Отмена
                                      </button>
                                    </>
                                  ) : (
                                    <button
                                      onClick={e => { e.stopPropagation(); setSubmissionDeleteConfirm(sub.id) }}
                                      disabled={isActing}
                                      style={actionBtnStyle('#999', isActing)}
                                    >
                                      Удалить
                                    </button>
                                  )}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </main>
    </>
  )
}
