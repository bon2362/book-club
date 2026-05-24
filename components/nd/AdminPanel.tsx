'use client'

import { useState, useEffect, Fragment, useLayoutEffect, useRef, useMemo } from 'react'
import type { UserSignup } from '@/lib/signup-books'
import type { BookWithCover } from '@/lib/books-with-covers'
import type { AdminFeedbackItem, AdminUserDetails, AdminUserSummary } from '@/lib/admin-users'
import Header from './Header'
import IntroEditor from './IntroEditor'
import AdminUserDrawer from './AdminUserDrawer'
import AdminBooksCatalog, { type CatalogParticipant } from './AdminBooksCatalog'

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
  allTags: string[]
  tagDescriptions: Record<string, string>
  userLanguages?: Record<string, string[]>
  bookPrioritiesMap: Record<string, { bookId: string; bookName: string; rank: number }[]>
  prioritiesSetMap: Record<string, boolean>
  catalogCount: number
}

type View = 'users' | 'catalog' | 'tags' | 'submissions' | 'feedback' | 'intro'
type SubmissionFilter = 'all' | 'pending' | 'approved' | 'rejected'
type FeedbackFilter = 'all' | 'registered' | 'anonymous'
type UserSortKey = 'name' | 'telegram' | 'books' | 'languages' | 'lastActivityAt' | 'createdAt'

const READ_SUBMISSIONS_STORAGE_KEY = 'admin_read_submission_ids'
const READ_FEEDBACK_STORAGE_KEY = 'admin_read_feedback_ids'

function readStoredIdSet(key: string) {
  if (typeof window === 'undefined') return new Set<string>()
  try {
    const raw = window.localStorage.getItem(key)
    const ids = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === 'string') : [])
  } catch {
    return new Set<string>()
  }
}

function writeStoredIdSet(key: string, ids: Set<string>) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(key, JSON.stringify(Array.from(ids)))
  } catch {
    // Ignore storage failures: notification badges still work for the current session.
  }
}

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

const adminBadge: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0.08rem 0.38rem',
  borderRadius: 2,
  background: '#111',
  color: '#fff',
  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
  fontSize: '0.62rem',
  fontWeight: 700,
  lineHeight: 1.35,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}

const newUserBadge: React.CSSProperties = {
  ...adminBadge,
  background: '#C0603A',
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

function AutoHeightTextarea({
  value,
  onChange,
  minRows = 1,
  style,
  ...props
}: Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, 'value' | 'onChange'> & {
  value: string
  onChange: (e: React.ChangeEvent<HTMLTextAreaElement>) => void
  minRows?: number
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null)

  useLayoutEffect(() => {
    const node = ref.current
    if (!node) return
    node.style.height = 'auto'
    node.style.height = `${node.scrollHeight}px`
  }, [value])

  return (
    <textarea
      {...props}
      ref={ref}
      value={value}
      onChange={onChange}
      rows={minRows}
      style={{
        resize: 'none',
        overflow: 'hidden',
        ...style,
      }}
    />
  )
}

function formatAdminDate(value: string | null): string {
  if (!value) return '—'
  return new Date(value).toLocaleDateString('ru-RU')
}

function dateValue(value: string | null): number {
  return value ? new Date(value).getTime() : 0
}

function isNewUser(createdAt: string | null): boolean {
  if (!createdAt) return false
  const created = dateValue(createdAt)
  if (!Number.isFinite(created)) return false
  const threeDaysMs = 3 * 24 * 60 * 60 * 1000
  const age = Date.now() - created
  return age >= 0 && age <= threeDaysMs
}

function SortHeader({ label, active, dir }: { label: string; active: boolean; dir: 'asc' | 'desc' }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', whiteSpace: 'nowrap' }}>
      <span>{label}</span>
      {active && <span aria-hidden="true">{dir === 'asc' ? '↑' : '↓'}</span>}
    </span>
  )
}

function CountBadge({ count }: { count: number }) {
  if (count <= 0) return null
  return (
    <span
      aria-label={`${count} новых`}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        minWidth: '1rem',
        height: '1rem',
        padding: '0 0.28rem',
        marginLeft: '0.35rem',
        borderRadius: 999,
        background: '#C0603A',
        color: '#fff',
        fontSize: '0.6rem',
        lineHeight: 1,
        letterSpacing: 0,
      }}
    >
      {count}
    </span>
  )
}

export default function AdminPanel({
  users,
  byBook,
  allTags,
  tagDescriptions: initialTagDescriptions,
  bookPrioritiesMap,
  catalogCount,
}: Props) {
  const [adminUsers, setAdminUsers] = useState<AdminUserSummary[]>([])
  const [adminUsersLoaded, setAdminUsersLoaded] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [userSort, setUserSort] = useState<{ key: UserSortKey; dir: 'asc' | 'desc' }>({ key: 'lastActivityAt', dir: 'desc' })
  const [selectedAdminUserId, setSelectedAdminUserId] = useState<string | null>(null)
  const [selectedAdminUser, setSelectedAdminUser] = useState<AdminUserDetails | null>(null)
  const [userDrawerLoading, setUserDrawerLoading] = useState(false)
  const [view, setView] = useState<View>('users')
  // Generic transient status message used by various admin actions (e.g. delete-user errors).
  const [syncMsg, setSyncMsg] = useState('')
  const [tagDescEdits, setTagDescEdits] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {}
    for (const tag of allTags) initial[tag] = initialTagDescriptions[tag] ?? ''
    return initial
  })
  const [tagSaving, setTagSaving] = useState<string | null>(null)
  const [tagSavedSet, setTagSavedSet] = useState<Set<string>>(new Set())

  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [submissionsLoaded, setSubmissionsLoaded] = useState(false)
  const [submissionFilter, setSubmissionFilter] = useState<SubmissionFilter>('pending')
  const [selectedSubmissionId, setSelectedSubmissionId] = useState<string | null>(null)
  const [submissionEdits, setSubmissionEdits] = useState<Record<string, Partial<Submission>>>({})
  const [submissionActionLoading, setSubmissionActionLoading] = useState<string | null>(null)
  const [submissionDeleteConfirm, setSubmissionDeleteConfirm] = useState<string | null>(null)
  const [readSubmissionIds, setReadSubmissionIds] = useState<Set<string>>(() => readStoredIdSet(READ_SUBMISSIONS_STORAGE_KEY))
  const [feedbackItems, setFeedbackItems] = useState<AdminFeedbackItem[]>([])
  const [feedbackLoaded, setFeedbackLoaded] = useState(false)
  const [feedbackFilter, setFeedbackFilter] = useState<FeedbackFilter>('all')
  const [feedbackSearch, setFeedbackSearch] = useState('')
  const [readFeedbackIds, setReadFeedbackIds] = useState<Set<string>>(() => readStoredIdSet(READ_FEEDBACK_STORAGE_KEY))

  useEffect(() => {
    fetch('/api/admin/submissions')
      .then(r => r.json())
      .then(d => {
        if (!d.success || !Array.isArray(d.data)) return
        setSubmissions(d.data)
        setSubmissionFilter(d.data.some((s: Submission) => s.status === 'pending') ? 'pending' : 'all')
      })
      .catch(() => {})
      .finally(() => setSubmissionsLoaded(true))
  }, [])

  useEffect(() => {
    fetch('/api/admin/users')
      .then(r => r.json())
      .then(d => { if (d.success && Array.isArray(d.data)) setAdminUsers(d.data) })
      .catch(() => {})
      .finally(() => setAdminUsersLoaded(true))
  }, [])

  useEffect(() => {
    fetch('/api/admin/feedback')
      .then(r => r.json())
      .then(d => { if (d.success && Array.isArray(d.data)) setFeedbackItems(d.data) })
      .catch(() => {})
      .finally(() => setFeedbackLoaded(true))
  }, [])

  useEffect(() => {
    if (view !== 'feedback' || !feedbackLoaded || feedbackItems.length === 0) return
    setReadFeedbackIds(prev => {
      const next = new Set(prev)
      let changed = false
      for (const item of feedbackItems) {
        if (!next.has(item.id)) {
          next.add(item.id)
          changed = true
        }
      }
      if (changed) writeStoredIdSet(READ_FEEDBACK_STORAGE_KEY, next)
      return changed ? next : prev
    })
  }, [feedbackItems, feedbackLoaded, view])

  function markSubmissionRead(id: string) {
    setReadSubmissionIds(prev => {
      if (prev.has(id)) return prev
      const next = new Set(prev)
      next.add(id)
      writeStoredIdSet(READ_SUBMISSIONS_STORAGE_KEY, next)
      return next
    })
  }

  async function openUserDrawer(userId: string) {
    setSelectedAdminUserId(userId)
    setSelectedAdminUser(null)
    setUserDrawerLoading(true)
    try {
      const res = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`)
      if (!res.ok) return
      const d = await res.json()
      if (d.success) setSelectedAdminUser(d.data)
    } finally {
      setUserDrawerLoading(false)
    }
  }

  function closeUserDrawer() {
    setSelectedAdminUserId(null)
    setSelectedAdminUser(null)
  }

  async function handleDeleteUser(userId: string, userName: string) {
    if (!window.confirm(`Удалить пользователя ${userName}? Это действие необратимо.`)) return
    try {
      const res = await fetch('/api/admin/delete-user', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null) as { error?: string } | null
        setSyncMsg(`Не удалось удалить пользователя: ${data?.error || res.statusText}`)
        return
      }
      setAdminUsers(prev => prev.filter(u => u.id !== userId))
      if (selectedAdminUserId === userId) closeUserDrawer()
    } catch {
      setSyncMsg('Не удалось удалить пользователя: ошибка сети')
    }
  }

  async function handleRemoveBook(userId: string, bookId: string, bookName: string, userName: string) {
    if (!window.confirm(`Снять ${userName} с книги «${bookName}»?`)) return
    try {
      const res = await fetch('/api/admin/signup-books', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, bookId }),
      })
      if (!res.ok) return
      setAdminUsers(prev => prev.map(u => u.id === userId ? { ...u, booksCount: Math.max(0, u.booksCount - 1) } : u))
      setSelectedAdminUser(prev => {
        if (!prev || prev.user.id !== userId) return prev
        return {
          ...prev,
          user: { ...prev.user, booksCount: Math.max(0, prev.user.booksCount - 1) },
          signupBooks: prev.signupBooks.filter(b => b.bookId !== bookId),
          priorities: prev.priorities.filter(p => p.bookId !== bookId),
        }
      })
    } catch {
      // silently ignore
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

  async function handleDeleteSubmission(id: string) {
    setSubmissionActionLoading(id)
    try {
      const res = await fetch(`/api/admin/submissions/${id}`, { method: 'DELETE' })
      if (res.ok) {
        setSubmissions(prev => {
          const next = prev.filter(s => s.id !== id)
          if (!next.some(s => s.status === 'pending')) setSubmissionFilter('all')
          return next
        })
        setSelectedSubmissionId(null)
        setSubmissionDeleteConfirm(null)
        markSubmissionRead(id)
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
        markSubmissionRead(id)
        setSubmissions(prev => {
          const next = prev.map(s => s.id === id ? { ...d.data, userEmail: s.userEmail } : s)
          if (!next.some(s => s.status === 'pending')) setSubmissionFilter('all')
          return next
        })
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

  const filteredAdminUsers = adminUsers
    .filter(u => {
      const q = userSearch.trim().toLowerCase()
      if (!q) return true
      return `${u.name} ${u.telegramDisplay} ${u.contacts ?? ''}`.toLowerCase().includes(q)
    })
    .sort((a, b) => {
      const dir = userSort.dir === 'asc' ? 1 : -1
      const value = (u: AdminUserSummary) => {
        if (userSort.key === 'books') return u.booksCount
        if (userSort.key === 'languages') return u.languages.join(', ')
        if (userSort.key === 'telegram') return u.telegramDisplay
        if (userSort.key === 'lastActivityAt') return dateValue(u.lastActivityAt)
        if (userSort.key === 'createdAt') return dateValue(u.createdAt)
        return u[userSort.key] ?? ''
      }
      const av = value(a)
      const bv = value(b)
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
      return String(av).localeCompare(String(bv), 'ru') * dir
    })

  const feedbackCounts = {
    all: feedbackItems.length,
    registered: feedbackItems.filter(f => f.userId).length,
    anonymous: feedbackItems.filter(f => !f.userId).length,
  }
  const unreadSubmissionsCount = submissions.filter(s => s.status === 'pending' && !readSubmissionIds.has(s.id)).length
  const feedbackNotificationCount = feedbackItems.filter(item => !readFeedbackIds.has(item.id)).length
  const filteredFeedback = feedbackItems.filter(item => {
    if (feedbackFilter === 'registered' && !item.userId) return false
    if (feedbackFilter === 'anonymous' && item.userId) return false
    const q = feedbackSearch.trim().toLowerCase()
    if (!q) return true
    return `${item.message} ${item.userName ?? item.name ?? ''} ${item.userContactEmail ?? item.userEmail ?? item.email ?? ''}`.toLowerCase().includes(q)
  })

  function setSort(key: UserSortKey) {
    setUserSort(prev => {
      if (prev.key === key) return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      return { key, dir: key === 'books' || key === 'lastActivityAt' || key === 'createdAt' ? 'desc' : 'asc' }
    })
  }

  const participantsByBookId = useMemo<Record<string, CatalogParticipant[]>>(() => {
    const map: Record<string, CatalogParticipant[]> = {}
    for (const { book, users: bookUsers } of byBook) {
      const list: CatalogParticipant[] = bookUsers.map(u => {
        const userPriorities = bookPrioritiesMap[u.userId] ?? []
        const entry = userPriorities.find(p => p.bookId === book.id)
        return { userId: u.userId, name: u.name, rank: entry?.rank ?? null }
      })
      list.sort((a, b) => {
        if (a.rank !== null && b.rank !== null) return a.rank - b.rank
        if (a.rank !== null) return -1
        if (b.rank !== null) return 1
        return 0
      })
      map[book.id] = list
    }
    return map
  }, [byBook, bookPrioritiesMap])

  const userSortLabel: Record<UserSortKey, string> = {
    name: 'Имя',
    telegram: 'Telegram',
    books: 'Книг',
    languages: 'Языки',
    lastActivityAt: 'Последняя активность',
    createdAt: 'Дата создания',
  }

  const submissionStatusLabel: Record<string, string> = { pending: 'На рассмотрении', approved: 'Одобрена', rejected: 'Отклонена' }
  const submissionStatusColor: Record<string, string> = { pending: '#C0603A', approved: '#2E7D32', rejected: '#999' }

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
          </div>
        </div>

        {/* Tabs */}
        <div style={{ borderBottom: '1px solid #E5E5E5', marginBottom: '1.5rem' }}>
          <button style={tabStyle(view === 'users')} onClick={() => setView('users')}>
            Участники ({adminUsersLoaded ? adminUsers.length : users.length})
          </button>
          <button style={tabStyle(view === 'catalog')} onClick={() => setView('catalog')} data-testid="admin-tab-catalog">
            Каталог ({catalogCount})
          </button>
          <button style={tabStyle(view === 'tags')} onClick={() => setView('tags')}>
            Теги ({allTags.length})
          </button>
          <button style={tabStyle(view === 'submissions')} onClick={() => setView('submissions')}>
            Заявки ({submissions.length})
            <CountBadge count={unreadSubmissionsCount} />
          </button>
          <button style={tabStyle(view === 'feedback')} onClick={() => setView('feedback')}>
            Фидбеки ({feedbackItems.length})
            <CountBadge count={feedbackNotificationCount} />
          </button>
          <button style={tabStyle(view === 'intro')} onClick={() => setView('intro')}>
            Интро
          </button>
        </div>

        {view === 'intro' && <IntroEditor />}

        {view === 'catalog' && <AdminBooksCatalog participantsByBookId={participantsByBookId} />}

        {/* Users table */}
        {view === 'users' && (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.9rem' }}>
              <input
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                placeholder="Поиск по имени или Telegram"
                aria-label="Поиск пользователей"
                style={{ ...fieldInput, maxWidth: 420, borderBottomColor: '#111' }}
              />
              <span style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.75rem', color: '#999' }}>
                {adminUsersLoaded ? `${filteredAdminUsers.length} из ${adminUsers.length}` : 'Загрузка…'}
              </span>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', border: '1px solid #E5E5E5' }}>
              <thead>
                <tr>
                  <th style={{ ...headCell, cursor: 'pointer', textAlign: 'right' }} onClick={() => setSort('books')}>
                    <SortHeader label={userSortLabel.books} active={userSort.key === 'books'} dir={userSort.dir} />
                  </th>
                  <th style={{ ...headCell, cursor: 'pointer' }} onClick={() => setSort('name')}>
                    <SortHeader label={userSortLabel.name} active={userSort.key === 'name'} dir={userSort.dir} />
                  </th>
                  <th style={{ ...headCell, cursor: 'pointer' }} onClick={() => setSort('telegram')}>
                    <SortHeader label={userSortLabel.telegram} active={userSort.key === 'telegram'} dir={userSort.dir} />
                  </th>
                  <th style={{ ...headCell, cursor: 'pointer' }} onClick={() => setSort('lastActivityAt')}>
                    <SortHeader label={userSortLabel.lastActivityAt} active={userSort.key === 'lastActivityAt'} dir={userSort.dir} />
                  </th>
                  <th style={{ ...headCell, cursor: 'pointer' }} onClick={() => setSort('createdAt')}>
                    <SortHeader label={userSortLabel.createdAt} active={userSort.key === 'createdAt'} dir={userSort.dir} />
                  </th>
                  <th style={{ ...headCell, cursor: 'pointer' }} onClick={() => setSort('languages')}>
                    <SortHeader label={userSortLabel.languages} active={userSort.key === 'languages'} dir={userSort.dir} />
                  </th>
                </tr>
              </thead>
              <tbody>
                {!adminUsersLoaded && (
                  <tr><td colSpan={6} style={{ ...cell, color: '#999' }}>Загрузка пользователей…</td></tr>
                )}
                {adminUsersLoaded && filteredAdminUsers.length === 0 && (
                  <tr><td colSpan={6} style={{ ...cell, color: '#999' }}>Никого не найдено</td></tr>
                )}
                {filteredAdminUsers.map(u => {
                  const telegram = u.telegramDisplay || '—'
                  return (
                    <tr
                      key={u.id}
                      onClick={() => openUserDrawer(u.id)}
                      style={{ cursor: 'pointer', transition: 'background 0.1s' }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#FAFAFA' }}
                      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
                    >
                      <td style={{ ...cell, textAlign: 'right', fontWeight: u.booksCount > 0 ? 700 : 400, color: u.booksCount > 0 ? '#111' : '#BBB' }}>{u.booksCount}</td>
                      <td style={{ ...cell, fontWeight: 700 }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', flexWrap: 'wrap' }}>
                          {u.name || <span style={{ color: '#bbb' }}>—</span>}
                          {u.isAdmin && <span style={adminBadge}>Admin</span>}
                          {isNewUser(u.createdAt) && <span style={newUserBadge}>New</span>}
                        </span>
                      </td>
                      <td style={cell}>{telegram}</td>
                      <td style={{ ...cell, color: '#666', whiteSpace: 'nowrap' }}>{formatAdminDate(u.lastActivityAt)}</td>
                      <td style={{ ...cell, color: '#666', whiteSpace: 'nowrap' }}>{formatAdminDate(u.createdAt)}</td>
                      <td style={{ ...cell, color: '#666' }}>
                        {u.languages.length === 0 ? <span style={{ color: '#ccc' }}>—</span> : u.languages.map(lang => (
                          <span key={lang} style={{ display: 'inline-block', padding: '0.08rem 0.38rem', marginRight: '0.25rem', background: '#F0F0F0', color: '#555', fontSize: '0.68rem', borderRadius: 2, textTransform: 'uppercase' }}>
                            {lang}
                          </span>
                        ))}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Tags editor */}
        {view === 'tags' && (
          <div style={{ maxWidth: '640px' }}>
            {allTags.map(tag => {
              const isSaving = tagSaving === tag
              const isSaved = tagSavedSet.has(tag)
              return (
                <div key={tag} data-testid={`tag-block-${tag}`} style={{ marginBottom: '1.5rem' }}>
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
                  <AutoHeightTextarea
                    value={tagDescEdits[tag] ?? ''}
                    onChange={e => setTagDescEdits(prev => ({ ...prev, [tag]: e.target.value }))}
                    minRows={1}
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
                    const topicValue = ('topic' in edits ? edits.topic : sub.topic) ?? ''
                    const topicOptions = topicValue && !allTags.includes(topicValue)
                      ? [topicValue, ...allTags]
                      : allTags

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
                                  <div style={fieldLabel}>Почему предлагаю прочитать?</div>
                                  <textarea
                                    value={edits.whyRead ?? sub.whyRead}
                                    onChange={e => updateSubmissionEdit(sub.id, 'whyRead', e.target.value)}
                                    rows={3}
                                    style={{ ...fieldInput, resize: 'vertical' }}
                                  />
                                </div>
                                <div>
                                  <div style={fieldLabel}>Тема</div>
                                  <select
                                    aria-label="Тема"
                                    value={topicValue}
                                    onChange={e => updateSubmissionEdit(sub.id, 'topic', e.target.value || null)}
                                    style={fieldInput}
                                  >
                                    <option value="">Не выбрана</option>
                                    {topicOptions.map(topic => (
                                      <option key={topic} value={topic}>{topic}</option>
                                    ))}
                                  </select>
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
                                  <div style={fieldLabel}>Ссылка на обложку</div>
                                  <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                                    <input
                                      value={edits.coverUrl ?? sub.coverUrl ?? ''}
                                      onChange={e => updateSubmissionEdit(sub.id, 'coverUrl', e.target.value || null)}
                                      placeholder="https://…"
                                      style={{ ...fieldInput, flex: 1 }}
                                    />
                                    {(() => {
                                      const url = (edits.coverUrl ?? sub.coverUrl ?? '').trim()
                                      if (!url) return null
                                      return (
                                        // eslint-disable-next-line @next/next/no-img-element
                                        <img
                                          src={url}
                                          alt="Превью обложки"
                                          style={{ width: '48px', height: '72px', objectFit: 'cover', border: '1px solid #DDD', background: '#F5F5F5' }}
                                          onError={e => { (e.currentTarget as HTMLImageElement).style.visibility = 'hidden' }}
                                        />
                                      )
                                    })()}
                                  </div>
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

        {view === 'feedback' && (
          <div>
            <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
              <input
                value={feedbackSearch}
                onChange={e => setFeedbackSearch(e.target.value)}
                placeholder="Поиск по тексту, имени или email"
                aria-label="Поиск фидбеков"
                style={{ ...fieldInput, maxWidth: 420 }}
              />
              {(['all', 'registered', 'anonymous'] as const).map(f => {
                const labels = { all: 'Все', registered: 'Зарегистрированные', anonymous: 'Анонимные' }
                return (
                  <button key={f} onClick={() => setFeedbackFilter(f)} style={filterBtnStyle(feedbackFilter === f)}>
                    {labels[f]} ({feedbackCounts[f]})
                  </button>
                )
              })}
            </div>
            {!feedbackLoaded && <p style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', color: '#666' }}>Загрузка…</p>}
            {feedbackLoaded && filteredFeedback.length === 0 && <p style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', color: '#999' }}>Нет фидбеков</p>}
            {feedbackLoaded && filteredFeedback.length > 0 && (
              <div style={{ display: 'grid', gap: '0.6rem' }}>
                {filteredFeedback.map(item => {
                  const displayName = item.userName ?? item.name ?? 'Аноним'
                  const displayEmail = item.userContactEmail ?? item.userEmail ?? item.email
                  return (
                    <article key={item.id} style={{ border: '1px solid #E5E5E5', background: '#fff', padding: '0.8rem 0.9rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.45rem', alignItems: 'baseline' }}>
                        <div>
                          {item.userId ? (
                            <button onClick={() => openUserDrawer(item.userId!)} style={{ background: 'none', border: 'none', padding: 0, color: '#111', fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--nd-sans), system-ui, sans-serif' }}>
                              {displayName}
                            </button>
                          ) : (
                            <span style={{ fontWeight: 700 }}>{displayName}</span>
                          )}
                          {displayEmail && <span style={{ color: '#999', marginLeft: '0.5rem', fontSize: '0.78rem' }}>{displayEmail}</span>}
                          {!item.userId && <span style={{ marginLeft: '0.5rem', background: '#F0F0F0', color: '#777', borderRadius: 2, padding: '0.08rem 0.4rem', fontSize: '0.68rem' }}>Аноним</span>}
                        </div>
                        <time style={{ color: '#999', fontSize: '0.72rem' }}>{new Date(item.createdAt).toLocaleString('ru-RU')}</time>
                      </div>
                      <div style={{ whiteSpace: 'pre-wrap', color: '#333', fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.86rem', lineHeight: 1.55 }}>
                        {item.message}
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </div>
        )}
      </main>
      <AdminUserDrawer
        isOpen={selectedAdminUserId !== null}
        data={selectedAdminUser}
        loading={userDrawerLoading}
        onClose={closeUserDrawer}
        onRemoveSignup={(bookId, bookName) => {
          if (!selectedAdminUser) return
          handleRemoveBook(selectedAdminUser.user.id, bookId, bookName, selectedAdminUser.user.name || selectedAdminUser.user.contactEmail || selectedAdminUser.user.telegramDisplay)
        }}
        onDeleteUser={() => {
          if (!selectedAdminUser) return
          handleDeleteUser(selectedAdminUser.user.id, selectedAdminUser.user.name || selectedAdminUser.user.contactEmail || selectedAdminUser.user.telegramDisplay)
        }}
        onOpenSubmission={(submissionId) => {
          closeUserDrawer()
          setView('submissions')
          setSubmissionFilter('all')
          setSelectedSubmissionId(submissionId)
        }}
      />
    </>
  )
}
