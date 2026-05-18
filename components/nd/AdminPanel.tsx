'use client'

import { useState, useEffect, Fragment, useMemo, useLayoutEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { UserSignup } from '@/lib/signup-books'
import type { BookWithCover } from '@/lib/books-with-covers'
import type { AdminFeedbackItem, AdminUserDetails, AdminUserSummary } from '@/lib/admin-users'
import Header from './Header'
import IntroEditor from './IntroEditor'
import AdminUserDrawer from './AdminUserDrawer'

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
  userLanguages?: Record<string, string[]>
  bookPrioritiesMap: Record<string, { bookName: string; rank: number }[]>
  prioritiesSetMap: Record<string, boolean>
}

type View = 'users' | 'books' | 'tags' | 'submissions' | 'feedback' | 'intro'
type SubmissionFilter = 'all' | 'pending' | 'approved' | 'rejected'
type FeedbackFilter = 'all' | 'registered' | 'anonymous'
type UserSortKey = 'name' | 'telegram' | 'books' | 'languages' | 'lastSignInAt' | 'createdAt'
type BookSortKey = 'name' | 'signups' | 'participants' | 'status' | 'new'

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

function getBookInitials(author: string): string {
  return author
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word[0]?.toUpperCase() ?? '')
    .join('')
}

function BookCoverThumb({ book }: { book: BookWithCover }) {
  const [imgError, setImgError] = useState(false)
  const initials = getBookInitials(book.author)

  return (
    <div
      style={{
        width: 34,
        height: 50,
        flex: '0 0 34px',
        border: '1px solid #DDD',
        background: '#F5F5F5',
        overflow: 'hidden',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {book.coverUrl && !imgError ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={book.coverUrl}
          alt={`Обложка: ${book.name}`}
          loading="lazy"
          decoding="async"
          style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
          onError={() => setImgError(true)}
        />
      ) : (
        <span
          aria-label={`Обложка: ${book.name}`}
          style={{
            fontFamily: 'var(--nd-sans), system-ui, sans-serif',
            fontSize: '0.65rem',
            color: '#999',
            userSelect: 'none',
          }}
        >
          {initials || '—'}
        </span>
      )}
    </div>
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
  statuses: initialStatuses,
  allTags,
  tagDescriptions: initialTagDescriptions,
  newFlags: initialNewFlags,
  bookPrioritiesMap,
}: Props) {
  const router = useRouter()
  const [adminUsers, setAdminUsers] = useState<AdminUserSummary[]>([])
  const [adminUsersLoaded, setAdminUsersLoaded] = useState(false)
  const [userSearch, setUserSearch] = useState('')
  const [userSort, setUserSort] = useState<{ key: UserSortKey; dir: 'asc' | 'desc' }>({ key: 'lastSignInAt', dir: 'desc' })
  const [selectedAdminUserId, setSelectedAdminUserId] = useState<string | null>(null)
  const [selectedAdminUser, setSelectedAdminUser] = useState<AdminUserDetails | null>(null)
  const [userDrawerLoading, setUserDrawerLoading] = useState(false)
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
  const [feedbackItems, setFeedbackItems] = useState<AdminFeedbackItem[]>([])
  const [feedbackLoaded, setFeedbackLoaded] = useState(false)
  const [feedbackFilter, setFeedbackFilter] = useState<FeedbackFilter>('all')
  const [feedbackSearch, setFeedbackSearch] = useState('')
  const [bookSort, setBookSort] = useState<{ key: BookSortKey; dir: 'asc' | 'desc' }>({ key: 'signups', dir: 'desc' })

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

  async function handleRemoveBook(userId: string, bookName: string, userName: string) {
    if (!window.confirm(`Снять ${userName} с книги «${bookName}»?`)) return
    try {
      const res = await fetch('/api/admin/signup-books', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, bookName }),
      })
      if (!res.ok) return
      setAdminUsers(prev => prev.map(u => u.id === userId ? { ...u, booksCount: Math.max(0, u.booksCount - 1) } : u))
      setSelectedAdminUser(prev => {
        if (!prev || prev.user.id !== userId) return prev
        return {
          ...prev,
          user: { ...prev.user, booksCount: Math.max(0, prev.user.booksCount - 1) },
          signupBooks: prev.signupBooks.filter(b => b.bookName !== bookName),
          priorities: prev.priorities.filter(p => p.bookName !== bookName),
        }
      })
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
      if (res.ok) router.refresh()
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
        setSubmissions(prev => {
          const next = prev.filter(s => s.id !== id)
          if (!next.some(s => s.status === 'pending')) setSubmissionFilter('all')
          return next
        })
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

  const filteredAdminUsers = adminUsers
    .filter(u => {
      const q = userSearch.trim().toLowerCase()
      if (!q) return true
      return `${u.name} ${u.telegramUsername ?? ''} ${u.contacts ?? ''}`.toLowerCase().includes(q)
    })
    .sort((a, b) => {
      const dir = userSort.dir === 'asc' ? 1 : -1
      const value = (u: AdminUserSummary) => {
        if (userSort.key === 'books') return u.booksCount
        if (userSort.key === 'languages') return u.languages.join(', ')
        if (userSort.key === 'telegram') return u.telegramUsername ?? u.contacts ?? ''
        if (userSort.key === 'lastSignInAt') return dateValue(u.lastSignInAt)
        if (userSort.key === 'createdAt') return dateValue(u.createdAt)
        return u[userSort.key] ?? ''
      }
      const av = value(a)
      const bv = value(b)
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
      return String(av).localeCompare(String(bv), 'ru') * dir
    })

  const sortedByBook = useMemo(() => {
    const statusRank = { reading: 2, read: 1, none: 0 }
    const value = ({ book, users: bookUsers }: BookEntry) => {
      if (bookSort.key === 'signups') return bookUsers.length
      if (bookSort.key === 'participants') return bookUsers.map(u => u.name).join(', ')
      if (bookSort.key === 'status') return statusRank[statuses[book.id] ?? 'none']
      if (bookSort.key === 'new') return (newFlags[book.id] ?? book.isNew) ? 1 : 0
      return `${book.name} ${book.author}`
    }

    return [...byBook].sort((a, b) => {
      const dir = bookSort.dir === 'asc' ? 1 : -1
      const av = value(a)
      const bv = value(b)
      let result: number
      if (typeof av === 'number' && typeof bv === 'number') {
        result = av - bv
      } else {
        result = String(av).localeCompare(String(bv), 'ru')
      }
      if (result !== 0) return result * dir
      return a.book.name.localeCompare(b.book.name, 'ru')
    })
  }, [bookSort, byBook, statuses, newFlags])

  const feedbackCounts = {
    all: feedbackItems.length,
    registered: feedbackItems.filter(f => f.userId).length,
    anonymous: feedbackItems.filter(f => !f.userId).length,
  }
  const pendingSubmissionsCount = submissions.filter(s => s.status === 'pending').length
  const feedbackNotificationCount = feedbackItems.length
  const filteredFeedback = feedbackItems.filter(item => {
    if (feedbackFilter === 'registered' && !item.userId) return false
    if (feedbackFilter === 'anonymous' && item.userId) return false
    const q = feedbackSearch.trim().toLowerCase()
    if (!q) return true
    return `${item.message} ${item.userName ?? item.name ?? ''} ${item.userEmail ?? item.email ?? ''}`.toLowerCase().includes(q)
  })

  function setSort(key: UserSortKey) {
    setUserSort(prev => {
      if (prev.key === key) return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      return { key, dir: key === 'books' || key === 'lastSignInAt' || key === 'createdAt' ? 'desc' : 'asc' }
    })
  }

  function setBookTableSort(key: BookSortKey) {
    setBookSort(prev => {
      if (prev.key === key) return { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      return { key, dir: key === 'signups' ? 'desc' : 'asc' }
    })
  }

  function bookSortMark(key: BookSortKey) {
    return <SortHeader label={bookSortLabel[key]} active={bookSort.key === key} dir={bookSort.dir} />
  }

  const userSortLabel: Record<UserSortKey, string> = {
    name: 'Имя',
    telegram: 'Telegram',
    books: 'Книг',
    languages: 'Языки',
    lastSignInAt: 'Последний вход',
    createdAt: 'Дата создания',
  }
  const bookSortLabel: Record<BookSortKey, string> = {
    name: 'Книга',
    signups: 'Записались',
    participants: 'Участники',
    status: 'Статус',
    new: 'Новая',
  }
  const topPriorityEmoji = ['🏆', '🥈', '🥉']

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
            Участники ({adminUsersLoaded ? adminUsers.length : users.length})
          </button>
          <button style={tabStyle(view === 'books')} onClick={() => setView('books')}>
            По книгам ({byBook.length})
          </button>
          <button style={tabStyle(view === 'tags')} onClick={() => setView('tags')}>
            Теги ({allTags.length})
          </button>
          <button style={tabStyle(view === 'submissions')} onClick={() => setView('submissions')}>
            Заявки ({submissions.length})
            <CountBadge count={pendingSubmissionsCount} />
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
                  <th style={{ ...headCell, cursor: 'pointer' }} onClick={() => setSort('lastSignInAt')}>
                    <SortHeader label={userSortLabel.lastSignInAt} active={userSort.key === 'lastSignInAt'} dir={userSort.dir} />
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
                  const telegram = u.telegramUsername ? `@${u.telegramUsername}` : (u.contacts?.startsWith('@') ? u.contacts : '—')
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
                      <td style={{ ...cell, color: '#666', whiteSpace: 'nowrap' }}>{formatAdminDate(u.lastSignInAt)}</td>
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

        {/* Books table */}
        {view === 'books' && (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th style={{ ...headCell, cursor: 'pointer' }} onClick={() => setBookTableSort('name')}>{bookSortMark('name')}</th>
                <th style={{ ...headCell, textAlign: 'right', cursor: 'pointer' }} onClick={() => setBookTableSort('signups')}>{bookSortMark('signups')}</th>
                <th style={{ ...headCell, cursor: 'pointer' }} onClick={() => setBookTableSort('participants')}>{bookSortMark('participants')}</th>
                <th style={{ ...headCell, cursor: 'pointer' }} onClick={() => setBookTableSort('status')}>{bookSortMark('status')}</th>
                <th style={{ ...headCell, textAlign: 'center', width: '80px', cursor: 'pointer' }} onClick={() => setBookTableSort('new')}>{bookSortMark('new')}</th>
              </tr>
            </thead>
            <tbody>
              {sortedByBook.map(({ book, users: bookUsers }) => {
                const currentStatus = statuses[book.id]
                const isStatusLoading = statusLoading === book.id
                const isSubmission = !book.id.match(/^\d+$/)
                const isNew = newFlags[book.id] ?? book.isNew
                const isFlagLoading = newFlagLoading === book.id
                return (
                  <tr key={book.id}>
                    <td style={cell}>
                      <div style={{ display: 'flex', gap: '0.65rem', alignItems: 'flex-start', minWidth: 0 }}>
                        <BookCoverThumb book={book} />
                        <div style={{ minWidth: 0 }}>
                          <div>{book.name}</div>
                          <div style={{ fontSize: '0.72rem', color: '#666', fontStyle: 'italic', marginTop: '0.12rem' }}>
                            {book.author || 'Автор не указан'}
                          </div>
                          <div style={{ fontSize: '0.65rem', color: '#999', marginTop: '0.15rem' }}>
                            {isSubmission ? 'Заявка' : 'Google Sheets'}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td style={{ ...cell, textAlign: 'right', fontWeight: 700 }}>{bookUsers.length}</td>
                    <td style={{ ...cell, color: '#666' }}>
                      {(() => {
                        const withRanks = bookUsers.map(u => {
                          const userPriorities = bookPrioritiesMap[u.userId] ?? [] // uses original prop intentionally; По книгам is static server data
                          const entry = userPriorities.find(p => p.bookName === book.name)
                          return { name: u.name, rank: entry?.rank ?? null, userId: u.userId }
                        })
                        withRanks.sort((a, b) => {
                          if (a.rank !== null && b.rank !== null) return a.rank - b.rank
                          if (a.rank !== null) return -1
                          if (b.rank !== null) return 1
                          return 0
                        })
                        return withRanks.map(({ name, rank, userId }, i) => (
                          <span key={userId}>
                            {i > 0 && ', '}
                            {name}
                            {rank !== null && (
                              <span style={{ fontSize: '0.65rem', color: '#aaa', whiteSpace: 'nowrap' }}>
                                ({topPriorityEmoji[rank - 1] ? `${topPriorityEmoji[rank - 1]} ` : ''}#{rank})
                              </span>
                            )}
                          </span>
                        ))
                      })()}
                    </td>
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
                  const displayEmail = item.userEmail ?? item.email
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
        onRemoveSignup={(bookName) => {
          if (!selectedAdminUser) return
          handleRemoveBook(selectedAdminUser.user.id, bookName, selectedAdminUser.user.name || selectedAdminUser.user.email)
        }}
        onDeleteUser={() => {
          if (!selectedAdminUser) return
          handleDeleteUser(selectedAdminUser.user.id, selectedAdminUser.user.name || selectedAdminUser.user.email)
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
