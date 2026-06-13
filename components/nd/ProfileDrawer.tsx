'use client'

import { useState, useEffect, useRef, useMemo } from 'react'
import { signOut, useSession } from 'next-auth/react'
import type { BookWithCover } from '@/lib/books-with-covers'
import type { UserSignup, UserSignupBook, PersonalBookStatus } from '@/lib/signup-books'
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { getUserContactEmail } from '@/lib/user-email'

declare global {
  interface Window {
    google?: {
      accounts?: {
        id: {
          initialize: (options: {
            client_id: string
            callback: (response: { credential?: string }) => void | Promise<void>
          }) => void
          prompt: (momentListener?: (notification: {
            isNotDisplayed: () => boolean
            isSkippedMoment: () => boolean
          }) => void) => void
          cancel: () => void
        }
      }
    }
  }
}

interface Submission {
  id: string
  title: string
  author: string
  pages: number | null
  status: string
  rejectionReason: string | null
}

interface Props {
  isOpen: boolean
  onClose: () => void
  selectedBooks: string[]
  initialSignups: UserSignupBook[]
  books: BookWithCover[]
  currentUser: UserSignup | null
  savedUser: { name: string; contacts: string } | null
  telegramLocked?: boolean
  onSaveContacts: (name: string, contacts: string) => Promise<void>
  onDeleteAccount: () => Promise<void>
  onToggleBook: (bookId: string) => Promise<void>
}

type Tab = 'signup' | 'submitted' | 'profile'
type AuthIdentityProvider = 'google' | 'email' | 'telegram'
type AuthIdentity = {
  provider: AuthIdentityProvider
  providerAccountId?: string | null
  email: string | null
  telegramUsername: string | null
  lastSeenAt: string | null
}

const AUTH_METHOD_PROVIDERS: Array<{
  provider: AuthIdentityProvider
  label: string
  shortLabel: string
}> = [
  { provider: 'telegram', label: 'Telegram', shortLabel: 'T' },
  { provider: 'google', label: 'Google', shortLabel: 'G' },
  { provider: 'email', label: 'Почта', shortLabel: '@' },
]

function authMethodDetail(provider: AuthIdentityProvider, identity?: AuthIdentity) {
  if (!identity) return 'не привязан'
  if (provider === 'telegram') {
    return identity.telegramUsername ? `@${identity.telegramUsername}` : 'Telegram ID привязан'
  }
  if (provider === 'google') {
    return identity.email ?? 'Google аккаунт привязан'
  }
  return identity.email ?? 'Почтовый вход привязан'
}

const TELEGRAM_BOT_NAME = process.env.NEXT_PUBLIC_TELEGRAM_BOT_NAME

const STATUS_LABELS: Record<string, string> = {
  pending: 'На рассмотрении',
  approved: 'Одобрена',
  rejected: 'Отклонена',
}

const LANGUAGES_PRIMARY = [
  { code: 'ru', label: 'На русском' },
  { code: 'en', label: 'In English' },
]
const LANGUAGES_EXTRA = [
  { code: 'de', label: 'Auf Deutsch' },
  { code: 'fr', label: 'En français' },
  { code: 'es', label: 'En español' },
  { code: 'pt', label: 'Português' },
]

const STATUS_LABEL: Record<'null' | 'reading' | 'read', string> = {
  null: 'Записал:ась',
  reading: 'Читаю',
  read: 'Прочитал:а',
}

type LocalStatus = { personalStatus: PersonalBookStatus; statusUpdatedAt: string | null }

function StatusMenu({
  current,
  onChange,
}: {
  current: PersonalBookStatus
  onChange: (s: PersonalBookStatus) => void
}) {
  const opts: Array<{ value: PersonalBookStatus; label: string }> = [
    { value: null, label: STATUS_LABEL.null },
    { value: 'reading', label: STATUS_LABEL.reading },
    { value: 'read', label: STATUS_LABEL.read },
  ]
  return (
    <div
      role="menu"
      data-testid="status-menu"
      style={{
        display: 'flex',
        gap: 6,
        padding: '10px 16px 12px',
        background: 'var(--bg)',
        borderBottom: '1px solid #f3f4f6',
        flexWrap: 'wrap',
      }}
    >
      {opts.map(o => {
        const isCurrent = o.value === current
        return (
          <button
            key={String(o.value)}
            type="button"
            role="menuitem"
            data-testid={`status-option-${o.value ?? 'null'}`}
            disabled={isCurrent}
            onClick={() => onChange(o.value)}
            style={{
              fontFamily: 'var(--nd-sans), system-ui, sans-serif',
              fontSize: '0.62rem',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              padding: '0.32rem 0.6rem',
              background: isCurrent ? '#111' : '#fff',
              color: isCurrent ? '#fff' : 'var(--text-secondary)',
              border: `1px solid ${isCurrent ? '#111' : '#e5e7eb'}`,
              cursor: isCurrent ? 'default' : 'pointer',
            }}
          >
            {o.label}
          </button>
        )
      })}
    </div>
  )
}

function SortableBookItem({
  id,
  rank,
  prioritiesSet,
  isUnranked,
  name,
  author,
  isUnsubscribed,
  isMenuOpen,
  onRowTap,
  onToggle,
  onStatusChange,
}: {
  id: string
  rank: number
  prioritiesSet: boolean
  isUnranked: boolean
  name: string
  author: string
  isUnsubscribed: boolean
  isMenuOpen: boolean
  onRowTap: () => void
  onToggle: () => void
  onStatusChange: (s: PersonalBookStatus) => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })
  const [rowHover, setRowHover] = useState(false)
  const [removeHover, setRemoveHover] = useState(false)

  const topEmojis = ['🏆', '🥈', '🥉']
  const showRank = prioritiesSet && !isUnranked && !isUnsubscribed
  const isTop3 = showRank && rank <= 3

  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 }}>
      <div
        data-testid="priority-book-row"
        data-book-id={id}
        onClick={onRowTap}
        onMouseEnter={() => setRowHover(true)}
        onMouseLeave={() => setRowHover(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '10px 16px',
          borderBottom: '1px solid #f3f4f6',
          background: isMenuOpen ? '#fafaf7' : rowHover ? '#f5f5f4' : '#fff',
          transition: 'background 120ms ease',
          userSelect: 'none',
          cursor: 'pointer',
        }}
      >
        {isTop3 ? (
          <span style={{
            width: 24, height: 24,
            fontSize: 18,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, marginRight: 10,
          }}>
            {topEmojis[rank - 1]}
          </span>
        ) : (
          <span style={{
            width: 24, height: 24, borderRadius: '50%',
            background: '#e5e7eb',
            color: '#6b7280',
            fontSize: 11, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, marginRight: 10,
          }}>
            {showRank ? rank : '—'}
          </span>
        )}
        <span
          {...attributes}
          {...listeners}
          onClick={e => e.stopPropagation()}
          style={{ color: 'var(--text-muted)', fontSize: 18, marginRight: 10, cursor: 'grab', lineHeight: 1, touchAction: 'none' }}
          aria-label="Перетащить"
        >
          ⠿
        </span>
        <span style={{
          flex: 1, minWidth: 0,
          display: 'flex', flexDirection: 'column', gap: 2,
          marginRight: 8,
        }}>
          <span style={{
            fontSize: 14,
            fontWeight: isUnsubscribed ? 'normal' : 500,
            textDecoration: isUnsubscribed ? 'line-through' : 'none',
            color: isUnsubscribed ? '#9ca3af' : '#111',
            lineHeight: 1.3,
          }}>
            {name}
          </span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.3 }}>{author}</span>
        </span>
        <button
          onClick={e => { e.stopPropagation(); onToggle() }}
          onMouseEnter={() => setRemoveHover(true)}
          onMouseLeave={() => setRemoveHover(false)}
          style={{
            border: 'none', cursor: 'pointer',
            color: isUnsubscribed
              ? (removeHover ? 'var(--status-ok-hover)' : 'var(--status-ok)')
              : (removeHover ? '#dc2626' : '#9ca3af'),
            background: removeHover
              ? (isUnsubscribed ? '#dcfce7' : '#fee2e2')
              : 'transparent',
            fontSize: 16, lineHeight: 1,
            width: 24, height: 24, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'background 120ms ease, color 120ms ease',
          }}
          title={isUnsubscribed ? 'Вернуть' : 'Отписаться'}
        >
          {isUnsubscribed ? '↩' : '×'}
        </button>
      </div>
      {isMenuOpen && <StatusMenu current={null} onChange={onStatusChange} />}
    </div>
  )
}

function StatusBookItem({
  id,
  name,
  author,
  current,
  isMenuOpen,
  onRowTap,
  onStatusChange,
}: {
  id: string
  name: string
  author: string
  current: PersonalBookStatus
  isMenuOpen: boolean
  onRowTap: () => void
  onStatusChange: (s: PersonalBookStatus) => void
}) {
  const [rowHover, setRowHover] = useState(false)
  return (
    <div>
      <div
        data-testid="status-book-row"
        data-book-id={id}
        onClick={onRowTap}
        onMouseEnter={() => setRowHover(true)}
        onMouseLeave={() => setRowHover(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          padding: '10px 16px',
          borderBottom: '1px solid #f3f4f6',
          background: isMenuOpen ? '#fafaf7' : rowHover ? '#f5f5f4' : '#fff',
          transition: 'background 120ms ease',
          userSelect: 'none',
          cursor: 'pointer',
        }}
      >
        <span style={{
          width: 24, height: 24, marginRight: 10, flexShrink: 0,
          fontSize: 14,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          {current === 'reading' ? '📖' : '✓'}
        </span>
        <span style={{
          flex: 1, minWidth: 0,
          display: 'flex', flexDirection: 'column', gap: 2,
        }}>
          <span style={{ fontSize: 14, fontWeight: 500, color: 'var(--text)', lineHeight: 1.3 }}>{name}</span>
          <span style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.3 }}>{author}</span>
        </span>
      </div>
      {isMenuOpen && <StatusMenu current={current} onChange={onStatusChange} />}
    </div>
  )
}

export default function ProfileDrawer({
  isOpen,
  onClose,
  selectedBooks,
  initialSignups,
  books,
  currentUser,
  savedUser,
  telegramLocked,
  onSaveContacts,
  onDeleteAccount,
  onToggleBook,
}: Props) {
  const { data: session } = useSession()
  const [activeTab, setActiveTab] = useState<Tab>('signup')

  // ── Submissions (Предложил:а tab) ──
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [submissionsLoaded, setSubmissionsLoaded] = useState(false)
  const [withdrawingId, setWithdrawingId] = useState<string | null>(null)
  const [withdrawFailedId, setWithdrawFailedId] = useState<string | null>(null)

  // ── Profile form ──
  const effectiveUser = currentUser ?? savedUser
  const [name, setName] = useState(effectiveUser?.name ?? '')
  const [contacts, setContacts] = useState(effectiveUser?.contacts ?? '')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)

  // ── Language preferences ──
  const [languages, setLanguages] = useState<string[] | null>(null)
  const [languagesNeverSaved, setLanguagesNeverSaved] = useState(false)
  const [languagesLoaded, setLanguagesLoaded] = useState(false)
  const [showExtraLanguages, setShowExtraLanguages] = useState(false)
  const langDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Auth identities ──
  const [authIdentities, setAuthIdentities] = useState<AuthIdentity[]>([])
  const [authIdentitiesLoaded, setAuthIdentitiesLoaded] = useState(false)
  const [linkingGoogle, setLinkingGoogle] = useState(false)
  const [linkingEmailExpanded, setLinkingEmailExpanded] = useState(false)
  const [linkingEmail, setLinkingEmail] = useState(false)
  const [linkEmail, setLinkEmail] = useState('')
  const [linkEmailSent, setLinkEmailSent] = useState(false)
  const [linkingError, setLinkingError] = useState('')
  const [telegramLinkAuthUrl, setTelegramLinkAuthUrl] = useState<string | null>(null)
  const hasTelegramIdentity = authIdentities.some(identity => identity.provider === 'telegram')

  // ── Toast ──
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // ── Book toggle state (optimistic) ──
  const [localUnsubscribed, setLocalUnsubscribed] = useState<Set<string>>(new Set())

  // ── My books tab state ──
  // Local copy of per-book status (optimistic). Initialized from initialSignups when tab is opened.
  const [statuses, setStatuses] = useState<Map<string, LocalStatus>>(new Map())
  const [priorityOrder, setPriorityOrder] = useState<string[]>([])
  const [unrankedBooks, setUnrankedBooks] = useState<Set<string>>(new Set())
  const [prioritiesLoaded, setPrioritiesLoaded] = useState(false)
  const [prioritiesSet, setPrioritiesSet] = useState(false)
  const [prioritiesSaving, setPrioritiesSaving] = useState<'idle' | 'saving' | 'saved'>('idle')
  const prioritiesDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Accordion menu ──
  const [openMenuBookId, setOpenMenuBookId] = useState<string | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  useEffect(() => {
    return () => { if (langDebounceRef.current) clearTimeout(langDebounceRef.current) }
  }, [])

  useEffect(() => {
    return () => { if (prioritiesDebounceRef.current) clearTimeout(prioritiesDebounceRef.current) }
  }, [])

  useEffect(() => {
    return () => { if (saveSuccessTimerRef.current) clearTimeout(saveSuccessTimerRef.current) }
  }, [])

  // ── Sync profile form ──
  useEffect(() => {
    if (effectiveUser) {
      setName(effectiveUser.name)
      setContacts(effectiveUser.contacts)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveUser?.name, effectiveUser?.contacts])

  // ── Load submissions on tab activation ──
  useEffect(() => {
    if (isOpen && activeTab === 'submitted' && !submissionsLoaded) {
      fetch('/api/submissions')
        .then(r => r.json())
        .then(data => {
          setSubmissions(data.submissions ?? [])
          setSubmissionsLoaded(true)
        })
        .catch(console.error)
    }
  }, [isOpen, activeTab, submissionsLoaded])

  // ── Initialize My Books state on tab activation ──
  useEffect(() => {
    if (!isOpen || activeTab !== 'signup' || prioritiesLoaded) return

    // Build status map from initialSignups + selectedBooks (book may be in selectedBooks but
    // not yet in initialSignups if just added in this session — treat as status=null).
    const map = new Map<string, LocalStatus>()
    for (const s of initialSignups) {
      map.set(s.bookId, { personalStatus: s.personalStatus, statusUpdatedAt: s.statusUpdatedAt })
    }
    for (const bookId of selectedBooks) {
      if (!map.has(bookId)) map.set(bookId, { personalStatus: null, statusUpdatedAt: null })
    }

    fetch('/api/priorities')
      .then(r => r.json())
      .then((data: { bookId: string | null; bookName: string; rank: number }[]) => {
        const rankedIds = data.map(d => d.bookId).filter((id): id is string => Boolean(id))
        // priorityOrder = only null-status books
        const nullBooks = selectedBooks.filter(id => (map.get(id)?.personalStatus ?? null) === null)
        const rankedNull = rankedIds.filter(id => nullBooks.includes(id))
        const unranked = nullBooks.filter(id => !rankedIds.includes(id))
        setStatuses(map)
        setPriorityOrder([...rankedNull, ...unranked])
        setUnrankedBooks(new Set(unranked))
        setPrioritiesSet(data.length > 0)
        setPrioritiesLoaded(true)
      })
      .catch(() => {
        setStatuses(map)
        const nullBooks = selectedBooks.filter(id => (map.get(id)?.personalStatus ?? null) === null)
        setPriorityOrder(nullBooks)
        setUnrankedBooks(new Set(nullBooks))
        setPrioritiesLoaded(true)
      })
  }, [isOpen, activeTab, prioritiesLoaded, selectedBooks, initialSignups])

  // ── Sync local state when selectedBooks changes (parent toggled signup) ──
  useEffect(() => {
    if (!prioritiesLoaded) return
    setStatuses(prev => {
      const next = new Map(prev)
      // remove signups for books no longer selected
      for (const bookId of Array.from(next.keys())) {
        if (!selectedBooks.includes(bookId)) next.delete(bookId)
      }
      // add fresh ones as null
      for (const bookId of selectedBooks) {
        if (!next.has(bookId)) next.set(bookId, { personalStatus: null, statusUpdatedAt: null })
      }
      return next
    })
    // Only null-status books belong in priorityOrder. New books from selectedBooks
    // default to status=null and go to the end as unranked.
    setPriorityOrder(prev => {
      const kept = prev.filter(b => selectedBooks.includes(b) && (statuses.get(b)?.personalStatus ?? null) === null)
      const added = selectedBooks.filter(b => !kept.includes(b) && (statuses.get(b)?.personalStatus ?? null) === null)
      if (added.length === 0) return kept
      return [...kept, ...added]
    })
    setUnrankedBooks(prev => {
      const next = new Set<string>()
      prev.forEach(id => { if (selectedBooks.includes(id) && (statuses.get(id)?.personalStatus ?? null) === null) next.add(id) })
      // newly added books (in selectedBooks but not yet in priorityOrder) are unranked
      for (const id of selectedBooks) {
        if ((statuses.get(id)?.personalStatus ?? null) === null && !priorityOrder.includes(id)) next.add(id)
      }
      return next
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedBooks, prioritiesLoaded])

  // ── Load language preferences on Profile tab activation ──
  useEffect(() => {
    if (isOpen && activeTab === 'profile' && !languagesLoaded) {
      fetch('/api/profile')
        .then(r => r.json())
        .then(data => {
          if (data.languages === null) {
            setLanguages([])
            setLanguagesNeverSaved(true)
          } else {
            setLanguages(data.languages)
            setLanguagesNeverSaved(false)
          }
          setLanguagesLoaded(true)
        })
        .catch(console.error)
    }
  }, [isOpen, activeTab, languagesLoaded])

  // ── Load linked auth methods on Profile tab activation ──
  useEffect(() => {
    if (!isOpen || activeTab !== 'profile' || authIdentitiesLoaded) return
    fetch('/api/me')
      .then(r => r.json())
      .then(data => {
        const identities = Array.isArray(data.user?.authMethods)
          ? data.user.authMethods
          : Array.isArray(data.user?.identities)
            ? data.user.identities
            : []
        setAuthIdentities(identities)
        setAuthIdentitiesLoaded(true)
      })
      .catch(() => {
        setAuthIdentitiesLoaded(true)
      })
  }, [isOpen, activeTab, authIdentitiesLoaded])

  useEffect(() => {
    if (!isOpen || activeTab !== 'profile' || !authIdentitiesLoaded || hasTelegramIdentity || !TELEGRAM_BOT_NAME) return

    let cancelled = false
    fetch('/api/account/identities/telegram/state')
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (!cancelled && typeof data?.authUrl === 'string') setTelegramLinkAuthUrl(data.authUrl)
      })
      .catch(() => {})

    return () => {
      cancelled = true
    }
  }, [isOpen, activeTab, authIdentitiesLoaded, hasTelegramIdentity])

  useEffect(() => {
    if (!isOpen || activeTab !== 'profile' || !telegramLinkAuthUrl || hasTelegramIdentity || !TELEGRAM_BOT_NAME) return

    const container = document.getElementById('telegram-link-container')
    if (!container) return

    container.innerHTML = ''
    const script = document.createElement('script')
    script.src = 'https://telegram.org/js/telegram-widget.js?22'
    script.setAttribute('data-telegram-login', TELEGRAM_BOT_NAME)
    script.setAttribute('data-size', 'medium')
    script.setAttribute('data-lang', 'ru')
    script.setAttribute('data-auth-url', telegramLinkAuthUrl)
    script.async = true
    container.appendChild(script)

    return () => {
      container.innerHTML = ''
    }
  }, [isOpen, activeTab, telegramLinkAuthUrl, hasTelegramIdentity])

  // ── Keyboard + scroll lock ──
  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (openMenuBookId) setOpenMenuBookId(null)
        else onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose, openMenuBookId])

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  // ── Unsubscribe / re-subscribe (× in записал:ась) ──
  async function handleToggle(bookId: string) {
    const book = books.find(b => b.id === bookId)
    const bookName = book?.name ?? 'книгу'
    const wasUnsubscribed = localUnsubscribed.has(bookId)
    setLocalUnsubscribed(prev => {
      const next = new Set(prev)
      if (wasUnsubscribed) next.delete(bookId)
      else next.add(bookId)
      return next
    })
    try {
      await onToggleBook(bookId)
      const msg = wasUnsubscribed
        ? `Вы успешно записались на «${bookName}»`
        : `Вы успешно отписались от «${bookName}»`
      setToast({ message: msg, type: 'success' })
    } catch {
      setLocalUnsubscribed(prev => {
        const next = new Set(prev)
        if (wasUnsubscribed) next.add(bookId)
        else next.delete(bookId)
        return next
      })
      const msg = wasUnsubscribed ? 'Не удалось записаться' : 'Не удалось отписаться'
      setToast({ message: msg, type: 'error' })
    }
  }

  function savePriorities(order: string[], unsubscribed: Set<string>) {
    if (prioritiesDebounceRef.current) clearTimeout(prioritiesDebounceRef.current)
    prioritiesDebounceRef.current = setTimeout(async () => {
      const booksToSave = order.filter(b => !unsubscribed.has(b))
      if (booksToSave.length === 0) return
      setPrioritiesSaving('saving')
      try {
        await fetch('/api/priorities', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ bookIds: booksToSave }),
        })
        setPrioritiesSet(true)
        setPrioritiesSaving('saved')
        setTimeout(() => setPrioritiesSaving('idle'), 2000)
      } catch {
        setPrioritiesSaving('idle')
      }
    }, 500)
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const oldIndex = priorityOrder.indexOf(active.id as string)
    const newIndex = priorityOrder.indexOf(over.id as string)
    const newOrder = arrayMove(priorityOrder, oldIndex, newIndex)
    setPriorityOrder(newOrder)
    // user manually placed books — clear unranked flag for all books in newOrder
    setUnrankedBooks(new Set())
    savePriorities(newOrder, localUnsubscribed)
  }

  async function patchStatus(bookId: string, status: PersonalBookStatus) {
    const res = await fetch(`/api/signup-books/${bookId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    })
    if (!res.ok) throw new Error('Failed to update status')
  }

  async function handleStatusChange(bookId: string, newStatus: PersonalBookStatus) {
    const prev = statuses.get(bookId)?.personalStatus ?? null
    if (prev === newStatus) {
      setOpenMenuBookId(null)
      return
    }

    // Optimistic update
    const now = new Date().toISOString()
    setStatuses(prevMap => {
      const next = new Map(prevMap)
      next.set(bookId, { personalStatus: newStatus, statusUpdatedAt: now })
      return next
    })

    let nextOrder = priorityOrder
    let nextUnranked = unrankedBooks
    if (prev === null && newStatus !== null) {
      // leaving "записал:ась" — drop from priorityOrder and unranked
      nextOrder = priorityOrder.filter(id => id !== bookId)
      nextUnranked = new Set(unrankedBooks)
      nextUnranked.delete(bookId)
      setPriorityOrder(nextOrder)
      setUnrankedBooks(nextUnranked)
    } else if (prev !== null && newStatus === null) {
      // returning to "записал:ась" — append to end, mark unranked
      nextOrder = [...priorityOrder, bookId]
      nextUnranked = new Set(unrankedBooks)
      nextUnranked.add(bookId)
      setPriorityOrder(nextOrder)
      setUnrankedBooks(nextUnranked)
    }

    setOpenMenuBookId(null)

    try {
      await patchStatus(bookId, newStatus)
      // If we modified the "записал:ась" set and user already had priorities set,
      // re-save priorities so the server-side rank list stays consistent with what
      // the user sees. We exclude unranked books to preserve "no priority" semantics.
      if (prioritiesSet && prev === null && newStatus !== null) {
        const rankedOnly = nextOrder.filter(id => !nextUnranked.has(id) && !localUnsubscribed.has(id))
        if (rankedOnly.length > 0) {
          await fetch('/api/priorities', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bookIds: rankedOnly }),
          })
        }
      }
      setToast({ message: 'Статус обновлён', type: 'success' })
    } catch {
      // Rollback
      setStatuses(prevMap => {
        const next = new Map(prevMap)
        next.set(bookId, { personalStatus: prev, statusUpdatedAt: prevMap.get(bookId)?.statusUpdatedAt ?? null })
        return next
      })
      setPriorityOrder(priorityOrder)
      setUnrankedBooks(unrankedBooks)
      setToast({ message: 'Не удалось обновить статус', type: 'error' })
    }
  }

  async function handleWithdraw(sub: Submission) {
    setWithdrawingId(sub.id)
    if (!window.confirm(`Отозвать предложение «${sub.title}»?`)) {
      setWithdrawingId(null)
      return
    }
    setWithdrawFailedId(null)
    try {
      const res = await fetch(`/api/submissions/${sub.id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('Failed')
      setSubmissions(prev => prev.filter(s => s.id !== sub.id))
    } catch {
      setWithdrawFailedId(sub.id)
    } finally {
      setWithdrawingId(null)
    }
  }

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setSaveError('')
    setSaveSuccess(false)
    try {
      await onSaveContacts(name.trim(), contacts.trim())
      setSaveSuccess(true)
      if (saveSuccessTimerRef.current) clearTimeout(saveSuccessTimerRef.current)
      saveSuccessTimerRef.current = setTimeout(() => setSaveSuccess(false), 2000)
    } catch {
      setSaveError('Что-то пошло не так')
    } finally {
      setSaving(false)
    }
  }

  function handleLanguageToggle(code: string) {
    if (!languagesLoaded) return
    const current = languages ?? []
    const next = current.includes(code)
      ? current.filter(c => c !== code)
      : [...current, code]
    setLanguages(next)
    setLanguagesNeverSaved(false)
    if (langDebounceRef.current) clearTimeout(langDebounceRef.current)
    langDebounceRef.current = setTimeout(async () => {
      try {
        await fetch('/api/profile', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ languages: next }),
        })
        setToast({ message: 'Языки сохранены', type: 'success' })
      } catch {
        setToast({ message: 'Не удалось сохранить языки', type: 'error' })
      }
    }, 500)
  }

  async function handleDeleteAccount() {
    if (!window.confirm('Вы уверены? Это действие нельзя отменить.')) return
    try {
      await onDeleteAccount()
    } catch {
      setToast({ message: 'Не удалось удалить аккаунт', type: 'error' })
    }
  }

  async function loadGoogleIdentityScript() {
    if (window.google?.accounts?.id) return
    await new Promise<void>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>('script[data-google-identity-linking="true"]')
      if (existing) {
        existing.addEventListener('load', () => resolve(), { once: true })
        existing.addEventListener('error', () => reject(new Error('Google Identity script failed')), { once: true })
        return
      }
      const script = document.createElement('script')
      script.src = 'https://accounts.google.com/gsi/client'
      script.async = true
      script.defer = true
      script.dataset.googleIdentityLinking = 'true'
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Google Identity script failed'))
      document.body.appendChild(script)
    })
  }

  async function handleLinkGoogle() {
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID
    if (!clientId || linkingGoogle) return
    setLinkingGoogle(true)
    setLinkingError('')

    try {
      await loadGoogleIdentityScript()
      await new Promise<void>((resolve, reject) => {
        let settled = false
        window.google?.accounts?.id.initialize({
          client_id: clientId,
          callback: async ({ credential }) => {
            if (settled) return
            settled = true
            if (!credential) {
              reject(new Error('missing_credential'))
              return
            }
            try {
              const res = await fetch('/api/account/identities/google', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ credential }),
              })
              const body = await res.json().catch(() => ({}))
              if (!res.ok) {
                reject(new Error(body.error === 'identity_conflict' ? 'identity_conflict' : 'link_failed'))
                return
              }
              const identity = body.identity as AuthIdentity | undefined
              if (identity) {
                setAuthIdentities(prev => {
                  const others = prev.filter(item => item.provider !== identity.provider)
                  return [identity, ...others]
                })
              }
              setToast({ message: 'Google привязан к вашему профилю', type: 'success' })
              resolve()
            } catch (error) {
              reject(error)
            }
          },
        })
        window.google?.accounts?.id.prompt(notification => {
          if (settled) return
          if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
            settled = true
            reject(new Error('prompt_skipped'))
          }
        })
      })
    } catch (error) {
      const message = error instanceof Error && error.message === 'identity_conflict'
        ? 'Этот Google уже привязан к другому профилю. Напишите организатору, чтобы объединить аккаунты.'
        : 'Не удалось привязать Google. Попробуйте ещё раз.'
      setLinkingError(message)
      setToast({ message, type: 'error' })
    } finally {
      setLinkingGoogle(false)
    }
  }

  async function handleLinkEmail(e: React.FormEvent) {
    e.preventDefault()
    const email = linkEmail.trim()
    if (!email || linkingEmail) return

    setLinkingEmail(true)
    setLinkingError('')
    setLinkEmailSent(false)

    try {
      const res = await fetch('/api/account/identities/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) {
        throw new Error(body.error === 'Invalid email' ? 'invalid_email' : 'link_failed')
      }
      setLinkEmailSent(true)
      setToast({ message: 'Письмо для привязки отправлено', type: 'success' })
    } catch (error) {
      const message = error instanceof Error && error.message === 'invalid_email'
        ? 'Введите корректный email.'
        : 'Не удалось отправить письмо. Попробуйте ещё раз.'
      setLinkingError(message)
      setToast({ message, type: 'error' })
    } finally {
      setLinkingEmail(false)
    }
  }

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } })
  )

  const contactEmail = getUserContactEmail(session?.user)
  const displayName = effectiveUser?.name?.trim() || session?.user?.name || contactEmail || ''
  const profileUnchanged = name.trim() === (effectiveUser?.name ?? '') && contacts.trim() === (effectiveUser?.contacts ?? '')
  const authIdentityByProvider = useMemo(() => {
    const map = new Map<AuthIdentityProvider, AuthIdentity>()
    authIdentities.forEach(identity => {
      if (!map.has(identity.provider)) map.set(identity.provider, identity)
    })
    return map
  }, [authIdentities])
  const latestAuthProvider = authIdentities[0]?.provider ?? session?.user?.provider ?? null

  // ── Derived: section book lists ──
  const { readingBooks, readBooks } = useMemo(() => {
    const reading: Array<{ bookId: string; statusUpdatedAt: string | null }> = []
    const read: Array<{ bookId: string; statusUpdatedAt: string | null }> = []
    for (const bookId of selectedBooks) {
      const st = statuses.get(bookId)
      if (!st) continue
      if (st.personalStatus === 'reading') reading.push({ bookId, statusUpdatedAt: st.statusUpdatedAt })
      else if (st.personalStatus === 'read') read.push({ bookId, statusUpdatedAt: st.statusUpdatedAt })
    }
    const byTimeDesc = (a: { statusUpdatedAt: string | null }, b: { statusUpdatedAt: string | null }) => {
      const ta = a.statusUpdatedAt ? Date.parse(a.statusUpdatedAt) : 0
      const tb = b.statusUpdatedAt ? Date.parse(b.statusUpdatedAt) : 0
      return tb - ta
    }
    reading.sort(byTimeDesc)
    read.sort(byTimeDesc)
    return { readingBooks: reading, readBooks: read }
  }, [selectedBooks, statuses])

  const hasAnyBook = priorityOrder.length > 0 || readingBooks.length > 0 || readBooks.length > 0

  const sectionLabel: React.CSSProperties = {
    fontFamily: 'var(--nd-sans), system-ui, sans-serif',
    fontSize: '0.55rem',
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    color: 'var(--text-muted)',
    marginBottom: '0.9rem',
  }

  const subsectionHeader: React.CSSProperties = {
    fontFamily: 'var(--nd-sans), system-ui, sans-serif',
    fontSize: '0.55rem',
    textTransform: 'uppercase',
    letterSpacing: '0.14em',
    color: 'var(--text-secondary)',
    padding: '14px 16px 8px',
    borderTop: '1px solid #f3f4f6',
    background: 'var(--bg-input)',
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: isOpen ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0)',
          zIndex: 200,
          pointerEvents: isOpen ? 'all' : 'none',
          transition: 'background 0.35s ease',
        }}
      />

      <div
        role="dialog"
        aria-label="Личный кабинет"
        aria-modal="true"
        aria-hidden={!isOpen}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: '380px',
          maxWidth: '100vw',
          height: '100dvh',
          background: 'var(--bg-input)',
          borderLeft: '2px solid #111',
          zIndex: 300,
          display: 'flex',
          flexDirection: 'column',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        <div style={{
          padding: '1.25rem 1.5rem 1rem',
          borderBottom: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}>
          <div>
            <div style={{
              fontFamily: 'var(--nd-sans), system-ui, sans-serif',
              fontSize: '0.55rem',
              textTransform: 'uppercase',
              letterSpacing: '0.15em',
              color: 'var(--text-muted)',
              marginBottom: '0.3rem',
            }}>
              Личный кабинет
            </div>
            <div style={{
              fontFamily: 'var(--nd-serif), Georgia, serif',
              fontSize: '1.3rem',
              color: 'var(--text)',
              letterSpacing: '-0.02em',
              fontWeight: 700,
            }}>
              {displayName}
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Закрыть"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              fontSize: '1.3rem',
              lineHeight: 1,
              padding: '0.25rem',
              flexShrink: 0,
              marginTop: '-2px',
              transition: 'color 0.15s',
            }}
          >
            ×
          </button>
        </div>

        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          {(['signup', 'submitted', 'profile'] as Tab[]).map(tab => {
            const labels: Record<Tab, string> = {
              signup: 'Мои книги',
              submitted: 'Предложил:а',
              profile: 'Профиль',
            }
            return (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  flex: 1,
                  padding: '0.75rem 0.5rem',
                  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                  fontSize: '0.6rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: activeTab === tab ? '#111' : 'var(--text-muted)',
                  background: 'none',
                  border: 'none',
                  borderBottom: activeTab === tab ? '2px solid #111' : '2px solid transparent',
                  cursor: 'pointer',
                  transition: 'color 0.15s, border-color 0.15s',
                  textAlign: 'center',
                }}
              >
                {labels[tab]}
              </button>
            )
          })}
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>

          {/* ── Tab: Мои книги ── */}
          {activeTab === 'signup' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              {/* Banner — shown until user has sorted at least once and there are signup books */}
              {prioritiesLoaded && !prioritiesSet && priorityOrder.length > 0 && (
                <div style={{
                  padding: '10px 16px', background: '#fff7ed',
                  borderBottom: '1px solid #fed7aa',
                  fontSize: 12, color: '#9a3412', lineHeight: 1.5,
                }}>
                  <strong>Расставь книги по интересу:</strong> перетащи их так, чтобы сверху оказались те, которые хочется прочитать сильнее всего. Это поможет подобрать тебе подходящую группу.
                </div>
              )}

              <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
                {!hasAnyBook && prioritiesLoaded ? (
                  <div style={{ padding: '24px 16px', color: 'var(--text-muted)', fontSize: 14, textAlign: 'center' }}>
                    Ты пока не записал:ась ни на одну книгу
                  </div>
                ) : (
                  <>
                    {/* Секция «Читаю» */}
                    {readingBooks.length > 0 && (
                      <section data-testid="section-reading">
                        <div style={subsectionHeader}>Читаю</div>
                        {readingBooks.map(({ bookId }) => {
                          const book = books.find(b => b.id === bookId)
                          if (!book) return null
                          return (
                            <StatusBookItem
                              key={bookId}
                              id={bookId}
                              name={book.name}
                              author={book.author}
                              current="reading"
                              isMenuOpen={openMenuBookId === bookId}
                              onRowTap={() => setOpenMenuBookId(prev => prev === bookId ? null : bookId)}
                              onStatusChange={s => handleStatusChange(bookId, s)}
                            />
                          )
                        })}
                      </section>
                    )}

                    {/* Секция «Записал:ась» */}
                    {priorityOrder.length > 0 && (
                      <section data-testid="section-signup">
                        <div style={subsectionHeader}>Записал:ась</div>
                        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                          <SortableContext items={priorityOrder} strategy={verticalListSortingStrategy}>
                            {priorityOrder.map((bookId, index) => {
                              const book = books.find(b => b.id === bookId)
                              if (!book) return null
                              return (
                                <SortableBookItem
                                  key={bookId}
                                  id={bookId}
                                  rank={index + 1}
                                  prioritiesSet={prioritiesSet}
                                  isUnranked={unrankedBooks.has(bookId)}
                                  name={book.name}
                                  author={book.author}
                                  isUnsubscribed={localUnsubscribed.has(bookId)}
                                  isMenuOpen={openMenuBookId === bookId}
                                  onRowTap={() => setOpenMenuBookId(prev => prev === bookId ? null : bookId)}
                                  onToggle={() => handleToggle(bookId)}
                                  onStatusChange={s => handleStatusChange(bookId, s)}
                                />
                              )
                            })}
                          </SortableContext>
                        </DndContext>
                      </section>
                    )}

                    {/* Секция «Прочитал:а» */}
                    {readBooks.length > 0 && (
                      <section data-testid="section-read">
                        <div style={subsectionHeader}>Прочитал:а</div>
                        {readBooks.map(({ bookId }) => {
                          const book = books.find(b => b.id === bookId)
                          if (!book) return null
                          return (
                            <StatusBookItem
                              key={bookId}
                              id={bookId}
                              name={book.name}
                              author={book.author}
                              current="read"
                              isMenuOpen={openMenuBookId === bookId}
                              onRowTap={() => setOpenMenuBookId(prev => prev === bookId ? null : bookId)}
                              onStatusChange={s => handleStatusChange(bookId, s)}
                            />
                          )
                        })}
                      </section>
                    )}
                  </>
                )}
              </div>

              {prioritiesLoaded && priorityOrder.length > 0 && (
                <div style={{
                  padding: '10px 16px', borderTop: '1px solid #e5e7eb',
                  fontSize: 12, color: 'var(--text-muted)',
                  display: 'flex', justifyContent: 'flex-end',
                }}>
                  {prioritiesSaving === 'saving' && <span>Сохранение...</span>}
                  {prioritiesSaving === 'saved' && <span style={{ color: 'var(--status-ok)' }}>✓ Сохранено</span>}
                </div>
              )}
            </div>
          )}

          {/* ── Tab: Предложил:а ── */}
          {activeTab === 'submitted' && (
            <div style={{ padding: '1.25rem 1.5rem' }}>
              <div style={sectionLabel}>Ваши предложения</div>
              {!submissionsLoaded ? (
                <p style={{
                  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                  fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', padding: '1rem 0',
                }}>
                  Загружаем…
                </p>
              ) : submissions.length === 0 ? (
                <p style={{
                  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                  fontSize: '0.78rem', color: 'var(--text-muted)', fontStyle: 'italic', textAlign: 'center', padding: '1rem 0',
                }}>
                  Ты ещё не предлагал:а книги
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {submissions.map(sub => (
                    <div key={sub.id} style={{
                      border: '1px solid var(--border)',
                      borderLeft: '3px solid #111',
                      padding: '0.75rem',
                    }}>
                      <div style={{
                        fontFamily: 'var(--nd-serif), Georgia, serif',
                        fontSize: '0.875rem', color: 'var(--text)', fontWeight: 700,
                        letterSpacing: '-0.01em', lineHeight: 1.3,
                      }}>
                        {sub.title}
                      </div>
                      <div style={{
                        fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                        fontSize: '0.7rem', color: 'var(--text-secondary)',
                        marginTop: '0.15rem', marginBottom: '0.5rem',
                      }}>
                        {sub.author}{sub.pages ? ` · ${sub.pages} стр.` : ''}
                      </div>
                      <StatusBadge status={sub.status} />
                      {sub.status === 'rejected' && sub.rejectionReason && (
                        <div style={{
                          fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                          fontSize: '0.68rem', color: 'var(--text-muted)',
                          marginTop: '0.4rem', fontStyle: 'italic', lineHeight: 1.4,
                        }}>
                          {sub.rejectionReason}
                        </div>
                      )}
                      {sub.status === 'pending' && (
                        <div style={{ marginTop: '0.6rem' }}>
                          <button
                            onClick={() => handleWithdraw(sub)}
                            disabled={withdrawingId === sub.id}
                            style={{
                              fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                              fontSize: '0.65rem',
                              color: withdrawingId === sub.id ? 'var(--border)' : 'var(--text-muted)',
                              background: 'none', border: 'none',
                              cursor: withdrawingId === sub.id ? 'default' : 'pointer',
                              padding: 0, textDecoration: 'underline',
                            }}
                          >
                            {withdrawingId === sub.id ? 'Отзываем…' : 'Отозвать'}
                          </button>
                          {withdrawFailedId === sub.id && (
                            <span style={{
                              fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                              fontSize: '0.65rem', color: 'var(--accent)', marginLeft: '0.5rem',
                            }}>
                              Не удалось отозвать
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Tab: Профиль ── */}
          {activeTab === 'profile' && (
            <div style={{ padding: '1.25rem 1.5rem' }}>
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={sectionLabel}>Контактные данные</div>
                <form onSubmit={handleSaveProfile} noValidate>
                  <div style={{ marginBottom: '1rem' }}>
                    <label htmlFor="pd-name" style={{
                      display: 'block',
                      fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                      fontSize: '0.55rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      color: 'var(--text-secondary)',
                      marginBottom: '0.35rem',
                    }}>
                      Имя
                    </label>
                    <input
                      id="pd-name"
                      type="text"
                      value={name}
                      onChange={e => setName(e.target.value)}
                      required
                      style={{
                        display: 'block', width: '100%',
                        padding: '0.55rem 0.7rem',
                        fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                        fontSize: '0.85rem', color: 'var(--text)', background: 'var(--bg-input)',
                        border: '1px solid var(--border)',
                        borderBottom: '2px solid var(--border-strong)',
                        outline: 'none', boxSizing: 'border-box',
                      }}
                    />
                  </div>
                  <div style={{ marginBottom: '1rem' }}>
                    <label htmlFor="pd-telegram" style={{
                      display: 'block',
                      fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                      fontSize: '0.55rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      color: 'var(--text-secondary)',
                      marginBottom: '0.35rem',
                    }}>
                      Telegram
                    </label>
                    <input
                      id="pd-telegram"
                      type="text"
                      value={contacts}
                      onChange={telegramLocked ? undefined : e => setContacts(e.target.value)}
                      readOnly={telegramLocked}
                      placeholder={telegramLocked ? '@username (привязан к аккаунту)' : '@username'}
                      style={{
                        display: 'block', width: '100%',
                        padding: '0.55rem 0.7rem',
                        fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                        fontSize: '0.85rem',
                        color: telegramLocked ? 'var(--text-secondary)' : '#111',
                        background: telegramLocked ? 'var(--bg-elevated)' : '#fff',
                        border: '1px solid var(--border)',
                        borderBottom: telegramLocked ? '2px solid #ccc' : '2px solid #111',
                        outline: 'none',
                        cursor: telegramLocked ? 'default' : 'text',
                        boxSizing: 'border-box',
                      }}
                    />
                    <div style={{
                      fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                      fontSize: '0.62rem', color: 'var(--text-muted)',
                      marginTop: '0.3rem', fontStyle: 'italic',
                    }}>
                      Организатор свяжется с вами для записи в группу
                    </div>
                  </div>
                  {saveError && (
                    <p style={{
                      fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                      fontSize: '0.8rem', color: 'var(--accent)', marginBottom: '1rem',
                    }}>
                      {saveError}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={saving || profileUnchanged}
                    style={{
                      width: '100%', padding: '0.65rem 1rem',
                      fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                      fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.1em',
                      background: saving ? 'var(--border)' : saveSuccess ? '#2A6E2A' : profileUnchanged ? 'var(--border)' : '#111',
                      color: (saving || profileUnchanged) ? 'var(--text-muted)' : '#fff',
                      border: `1px solid ${profileUnchanged ? 'var(--border)' : '#111'}`,
                      cursor: (saving || profileUnchanged) ? 'default' : 'pointer',
                      transition: 'background 0.15s, color 0.15s',
                    }}
                  >
                    {saving ? 'Сохраняем…' : saveSuccess ? 'Сохранено ✓' : 'Сохранить'}
                  </button>
                </form>
              </div>

              <div style={{ marginBottom: '1.5rem' }}>
                <div style={sectionLabel}>Языки чтения</div>
                {languagesNeverSaved && languagesLoaded && (
                  <p style={{
                    fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                    fontSize: '0.72rem', color: 'var(--text-muted)', fontStyle: 'italic',
                    marginBottom: '0.75rem',
                  }}>
                    Выберите языки чтения
                  </p>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {LANGUAGES_PRIMARY.map(lang => (
                    <LangButton key={lang.code} lang={lang}
                      active={(languages ?? []).includes(lang.code)}
                      disabled={!languagesLoaded}
                      onToggle={handleLanguageToggle} />
                  ))}
                  {LANGUAGES_EXTRA.filter(lang =>
                    showExtraLanguages || (languages ?? []).includes(lang.code)
                  ).map(lang => (
                    <LangButton key={lang.code} lang={lang}
                      active={(languages ?? []).includes(lang.code)}
                      disabled={!languagesLoaded}
                      onToggle={handleLanguageToggle} />
                  ))}
                  <button
                    onClick={() => setShowExtraLanguages(v => !v)}
                    style={{
                      fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                      fontSize: '0.72rem', color: 'var(--text-muted)',
                      background: 'none', border: '1px dashed #ccc',
                      padding: '0.3rem 0.65rem', cursor: 'pointer',
                    }}
                  >
                    {showExtraLanguages ? 'скрыть' : '+ ещё'}
                  </button>
                </div>
              </div>

              <div style={{ marginBottom: '1.5rem' }} data-testid="auth-methods-section">
                <div style={sectionLabel}>Способы входа</div>
                <p style={{
                  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                  fontSize: '0.72rem',
                  color: 'var(--text-secondary)',
                  lineHeight: 1.5,
                  margin: '-0.35rem 0 0.85rem',
                }}>
                  Привязанные способы ведут в этот же профиль и помогают не создать дубль.
                </p>
                <div style={{
                  borderTop: '1px solid var(--border)',
                  borderBottom: '1px solid var(--border)',
                }}>
                  {!authIdentitiesLoaded ? (
                    <div style={{
                      padding: '0.75rem 0',
                      fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                      fontSize: '0.75rem',
                      color: 'var(--text-muted)',
                    }}>
                      Загружаем…
                    </div>
                  ) : (
                    AUTH_METHOD_PROVIDERS.map(method => {
                      const identity = authIdentityByProvider.get(method.provider)
                      const connected = Boolean(identity)
                      const isLatest = connected && latestAuthProvider === method.provider
                      return (
                        <div
                          key={method.provider}
                          data-testid={`auth-method-${method.provider}`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            flexWrap: 'wrap',
                            gap: '0.75rem',
                            padding: '0.7rem 0',
                            borderTop: '1px solid var(--border-subtle)',
                          }}
                        >
                          <span
                            aria-hidden="true"
                            style={{
                              width: 24,
                              height: 24,
                              flexShrink: 0,
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                              fontSize: '0.62rem',
                              fontWeight: 700,
                              color: connected ? 'var(--text)' : 'var(--text-muted)',
                              border: '1px solid var(--border)',
                              opacity: connected ? 1 : 0.55,
                            }}
                          >
                            {method.shortLabel}
                          </span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem', minWidth: 0 }}>
                              <span style={{
                                fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                                fontSize: '0.78rem',
                                fontWeight: 600,
                                color: connected ? 'var(--text)' : 'var(--text-secondary)',
                              }}>
                                {method.label}
                              </span>
                              {isLatest && (
                                <span style={{
                                  flexShrink: 0,
                                  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                                  fontSize: '0.5rem',
                                  color: 'var(--accent)',
                                  textTransform: 'uppercase',
                                  letterSpacing: '0.1em',
                                  border: '1px solid var(--accent)',
                                  padding: '0.08rem 0.32rem',
                                }}>
                                  последний вход
                                </span>
                              )}
                            </div>
                            <div style={{
                              fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                              fontSize: '0.68rem',
                              color: 'var(--text-muted)',
                              fontStyle: connected ? 'normal' : 'italic',
                              marginTop: 2,
                              overflow: 'hidden',
                              textOverflow: 'ellipsis',
                              whiteSpace: 'nowrap',
                            }}>
                              {authMethodDetail(method.provider, identity)}
                            </div>
                          </div>
                          {connected ? (
                            <span style={{
                              flexShrink: 0,
                              fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                              fontSize: '0.55rem',
                              color: 'var(--text-muted)',
                              textTransform: 'uppercase',
                              letterSpacing: '0.12em',
                            }}>
                              привязан
                            </span>
                          ) : method.provider === 'google' ? (
                            <button
                              type="button"
                              onClick={handleLinkGoogle}
                              disabled={linkingGoogle}
                              data-testid="link-google-button"
                              style={{
                                flexShrink: 0,
                                padding: '0.38rem 0.62rem',
                                fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                                fontSize: '0.58rem',
                                textTransform: 'uppercase',
                                letterSpacing: '0.09em',
                                background: linkingGoogle ? 'var(--border)' : 'var(--text)',
                                color: linkingGoogle ? 'var(--text-muted)' : 'var(--bg)',
                                border: '1px solid var(--border-strong)',
                                cursor: linkingGoogle ? 'default' : 'pointer',
                              }}
                            >
                              {linkingGoogle ? 'Привязываем…' : 'Привязать'}
                            </button>
                          ) : method.provider === 'email' ? (
                            <button
                              type="button"
                              onClick={() => {
                                setLinkingEmailExpanded(v => !v)
                                setLinkingError('')
                              }}
                              data-testid="link-email-button"
                              style={{
                                flexShrink: 0,
                                padding: '0.38rem 0.62rem',
                                fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                                fontSize: '0.58rem',
                                textTransform: 'uppercase',
                                letterSpacing: '0.09em',
                                background: linkingEmailExpanded ? 'transparent' : 'var(--text)',
                                color: linkingEmailExpanded ? 'var(--text-secondary)' : 'var(--bg)',
                                border: '1px solid var(--border-strong)',
                                cursor: 'pointer',
                              }}
                            >
                              {linkingEmailExpanded ? 'Скрыть' : 'Привязать'}
                            </button>
                          ) : (
                            <span style={{
                              flexShrink: 0,
                              fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                              fontSize: '0.55rem',
                              color: 'var(--text-muted)',
                              textTransform: 'uppercase',
                              letterSpacing: '0.12em',
                            }}>
                              не привязан
                            </span>
                          )}
                          {!connected && method.provider === 'email' && linkingEmailExpanded && (
                            <form
                              onSubmit={handleLinkEmail}
                              style={{
                                marginTop: '0.55rem',
                                marginLeft: '2.75rem',
                                flexBasis: 'calc(100% - 2.75rem)',
                                display: 'flex',
                                flexDirection: 'column',
                                gap: '0.45rem',
                              }}
                            >
                              {linkEmailSent ? (
                                <p style={{
                                  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                                  fontSize: '0.68rem',
                                  color: 'var(--success)',
                                  lineHeight: 1.45,
                                  margin: 0,
                                }}>
                                  Проверьте почту и подтвердите привязку по ссылке.
                                </p>
                              ) : (
                                <>
                                  <label
                                    htmlFor="profile-link-email"
                                    style={{
                                      fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                                      fontSize: '0.55rem',
                                      color: 'var(--text-muted)',
                                      textTransform: 'uppercase',
                                      letterSpacing: '0.12em',
                                    }}
                                  >
                                    Email для привязки
                                  </label>
                                  <div style={{ display: 'flex', gap: '0.45rem' }}>
                                    <input
                                      id="profile-link-email"
                                      type="email"
                                      value={linkEmail}
                                      onChange={e => {
                                        setLinkEmail(e.target.value)
                                        setLinkingError('')
                                      }}
                                      placeholder="ваш@email.com"
                                      required
                                      style={{
                                        flex: 1,
                                        minWidth: 0,
                                        fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                                        fontSize: '0.78rem',
                                        color: 'var(--text)',
                                        background: 'var(--bg-input)',
                                        border: '1px solid var(--border)',
                                        borderBottom: '2px solid var(--border-strong)',
                                        padding: '0.45rem 0.55rem',
                                        outline: 'none',
                                      }}
                                    />
                                    <button
                                      type="submit"
                                      disabled={linkingEmail || !linkEmail.trim()}
                                      style={{
                                        flexShrink: 0,
                                        padding: '0.45rem 0.6rem',
                                        fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                                        fontSize: '0.55rem',
                                        textTransform: 'uppercase',
                                        letterSpacing: '0.09em',
                                        background: linkingEmail || !linkEmail.trim() ? 'var(--border)' : 'var(--text)',
                                        color: linkingEmail || !linkEmail.trim() ? 'var(--text-muted)' : 'var(--bg)',
                                        border: '1px solid var(--border-strong)',
                                        cursor: linkingEmail || !linkEmail.trim() ? 'default' : 'pointer',
                                      }}
                                    >
                                      {linkingEmail ? 'Отправляем…' : 'Получить ссылку'}
                                    </button>
                                  </div>
                                </>
                              )}
                            </form>
                          )}
                        </div>
                      )
                    })
                  )}
                </div>

                {!hasTelegramIdentity && TELEGRAM_BOT_NAME && (
                  <div style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.45rem',
                    marginTop: '0.75rem',
                    paddingTop: '0.75rem',
                    borderTop: '1px solid var(--border)',
                  }}>
                    <div id="telegram-link-container" style={{ minHeight: 28 }} />
                    <div style={{
                      fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                      fontSize: '0.68rem',
                      color: 'var(--text-muted)',
                      lineHeight: 1.4,
                      textAlign: 'center',
                    }}>
                      Привязка Telegram сохранит этот профиль и не создаст новый.
                    </div>
                  </div>
                )}
                {linkingError && (
                  <p style={{
                    fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                    fontSize: '0.72rem',
                    color: 'var(--accent)',
                    lineHeight: 1.45,
                    margin: '0.55rem 0 0',
                  }}>
                    {linkingError}
                  </p>
                )}
              </div>

              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'flex-end',
                padding: '0.65rem 0', marginBottom: '0.75rem', gap: '0.75rem',
                borderTop: '1px solid var(--border)',
              }}>
                <button
                  onClick={() => signOut({ callbackUrl: '/' })}
                  style={{
                    fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                    fontSize: '0.65rem', color: 'var(--text-muted)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    flexShrink: 0, whiteSpace: 'nowrap', textDecoration: 'underline',
                  }}
                >
                  Выйти
                </button>
              </div>

              {effectiveUser && (
                <div style={{ textAlign: 'center' }}>
                  <button
                    type="button"
                    onClick={handleDeleteAccount}
                    style={{
                      fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                      fontSize: '0.7rem', color: 'var(--text-muted)',
                      background: 'none', border: 'none', cursor: 'pointer',
                      textDecoration: 'underline',
                    }}
                  >
                    Удалить аккаунт
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '1.5rem', right: '1.5rem', zIndex: 9999,
          background: toast.type === 'error' ? 'var(--accent)' : '#111',
          color: 'var(--bg)',
          fontFamily: 'var(--nd-sans), system-ui, sans-serif',
          fontSize: '0.8rem',
          padding: '0.65rem 1rem',
          maxWidth: '300px', lineHeight: 1.4,
          boxShadow: '0 4px 16px rgba(0,0,0,0.2)',
        }}>
          {toast.message}
        </div>
      )}
    </>
  )
}

function LangButton({
  lang,
  active,
  disabled,
  onToggle,
}: {
  lang: { code: string; label: string }
  active: boolean
  disabled: boolean
  onToggle: (code: string) => void
}) {
  return (
    <button
      onClick={() => onToggle(lang.code)}
      disabled={disabled}
      style={{
        fontFamily: 'var(--nd-sans), system-ui, sans-serif',
        fontSize: '0.72rem',
        padding: '0.3rem 0.65rem',
        background: disabled ? 'var(--bg-elevated)' : active ? '#111' : '#fff',
        color: disabled ? 'var(--border)' : active ? '#fff' : '#111',
        border: `1px solid ${disabled ? 'var(--border)' : active ? '#111' : 'var(--border)'}`,
        cursor: disabled ? 'default' : 'pointer',
        transition: 'background 0.15s, color 0.15s',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {lang.label}
    </button>
  )
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, React.CSSProperties> = {
    pending: { color: '#996600', borderColor: '#DDCC88', background: '#FDFAF0' },
    approved: { color: '#2A6E2A', borderColor: '#AADDAA', background: '#F2FAF2' },
    rejected: { color: '#881111', borderColor: '#DDAAAA', background: '#FDF2F2' },
  }
  return (
    <span style={{
      display: 'inline-block',
      fontFamily: 'var(--nd-sans), system-ui, sans-serif',
      fontSize: '0.55rem',
      textTransform: 'uppercase',
      letterSpacing: '0.1em',
      padding: '0.2rem 0.4rem',
      border: '1px solid',
      ...(styles[status] ?? { color: 'var(--text-secondary)', borderColor: 'var(--border)', background: 'var(--bg-elevated)' }),
    }}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}
