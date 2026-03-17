'use client'

import { useState, useEffect, useRef } from 'react'
import { signOut, useSession } from 'next-auth/react'
import type { BookWithCover } from '@/lib/books-with-covers'
import type { UserSignup } from '@/lib/signups'
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
  books: BookWithCover[]
  currentUser: UserSignup | null
  savedUser: { name: string; contacts: string } | null
  telegramLocked?: boolean
  onSaveContacts: (name: string, contacts: string) => Promise<void>
  onDeleteAccount: () => Promise<void>
  onToggleBook: (bookName: string) => Promise<void>
}

type Tab = 'signup' | 'submitted' | 'profile'

const STATUS_LABELS: Record<string, string> = {
  pending: 'На рассмотрении',
  approved: 'Одобрена',
  rejected: 'Отклонена',
}

// All languages available for selection
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

function SortableBookItem({
  id,
  rank,
  name,
  author,
  isUnsubscribed,
  onToggle,
}: {
  id: string
  rank: number
  name: string
  author: string
  isUnsubscribed: boolean
  onToggle: () => void
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    display: 'flex',
    alignItems: 'center',
    padding: '10px 16px',
    borderBottom: '1px solid #f3f4f6',
    background: '#fff',
    userSelect: 'none',
  }

  const rankColors = ['#f97316', '#fb923c', '#fdba74']
  const rankBg = rank <= 3 ? rankColors[rank - 1] : '#e5e7eb'
  const rankColor = rank <= 3 ? 'white' : '#6b7280'

  return (
    <div ref={setNodeRef} style={style}>
      <span style={{
        width: 24, height: 24, borderRadius: '50%',
        background: isUnsubscribed ? '#e5e7eb' : rankBg,
        color: isUnsubscribed ? '#9ca3af' : rankColor,
        fontSize: 11, fontWeight: 700,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, marginRight: 10,
      }}>
        {rank}
      </span>
      <span
        {...attributes}
        {...listeners}
        style={{ color: '#d1d5db', fontSize: 18, marginRight: 10, cursor: 'grab', lineHeight: 1, touchAction: 'none' }}
        aria-label="Перетащить"
      >
        ⠿
      </span>
      <span style={{
        flex: 1, fontSize: 14,
        fontWeight: isUnsubscribed ? 'normal' : 500,
        textDecoration: isUnsubscribed ? 'line-through' : 'none',
        color: isUnsubscribed ? '#9ca3af' : '#111',
      }}>
        {name}
      </span>
      <span style={{ fontSize: 11, color: '#9ca3af', marginRight: 8 }}>{author}</span>
      <button
        onClick={onToggle}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          color: isUnsubscribed ? '#22c55e' : '#9ca3af',
          fontSize: 13, padding: '0 4px',
        }}
        title={isUnsubscribed ? 'Вернуть' : 'Отписаться'}
      >
        {isUnsubscribed ? '↩' : '×'}
      </button>
    </div>
  )
}

export default function ProfileDrawer({
  isOpen,
  onClose,
  selectedBooks,
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
  const [withdrawFailedId, setWithdrawFailedId] = useState<string | null>(null) // stores submission ID of failed withdrawal

  // ── Profile form ──
  const effectiveUser = currentUser ?? savedUser
  const [name, setName] = useState(effectiveUser?.name ?? '')
  const [contacts, setContacts] = useState(effectiveUser?.contacts ?? '')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)

  // ── Language preferences ──
  const [languages, setLanguages] = useState<string[] | null>(null) // null = not loaded yet
  const [languagesNeverSaved, setLanguagesNeverSaved] = useState(false)
  const [languagesLoaded, setLanguagesLoaded] = useState(false)
  const [showExtraLanguages, setShowExtraLanguages] = useState(false)
  const langDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Toast ──
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), 3000)
    return () => clearTimeout(t)
  }, [toast])

  // Cleanup lang debounce timer on unmount to prevent state update after unmount
  useEffect(() => {
    return () => {
      if (langDebounceRef.current) clearTimeout(langDebounceRef.current)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (prioritiesDebounceRef.current) clearTimeout(prioritiesDebounceRef.current)
    }
  }, [])

  // Cleanup saveSuccess timer on unmount
  useEffect(() => {
    return () => {
      if (saveSuccessTimerRef.current) clearTimeout(saveSuccessTimerRef.current)
    }
  }, [])

  // ── Book toggle state (optimistic) ──
  // Tracks locally-toggled books within this drawer session
  const [localUnsubscribed, setLocalUnsubscribed] = useState<Set<string>>(new Set())

  // ── Book priorities (Записал:ась tab) ──
  const [priorityOrder, setPriorityOrder] = useState<string[]>([]) // book names in rank order
  const [prioritiesLoaded, setPrioritiesLoaded] = useState(false)
  const [prioritiesSet, setPrioritiesSet] = useState(false) // true = user has sorted at least once
  const [prioritiesSaving, setPrioritiesSaving] = useState<'idle' | 'saving' | 'saved'>('idle')
  const prioritiesDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // ── Sync profile form when user data changes ──
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

  // ── Load priorities on signup tab activation ──
  useEffect(() => {
    if (!isOpen || activeTab !== 'signup' || prioritiesLoaded) return
    fetch('/api/priorities')
      .then(r => r.json())
      .then((data: { bookName: string; rank: number }[]) => {
        const rankedNames = data.map(d => d.bookName)
        const unranked = selectedBooks.filter(b => !rankedNames.includes(b))
        const merged = [...rankedNames.filter(b => selectedBooks.includes(b)), ...unranked]
        setPriorityOrder(merged.length > 0 ? merged : [...selectedBooks])
        setPrioritiesSet(data.length > 0)
        setPrioritiesLoaded(true)
      })
      .catch(() => {
        setPriorityOrder([...selectedBooks])
        setPrioritiesLoaded(true)
      })
  }, [isOpen, activeTab, prioritiesLoaded, selectedBooks])

  // ── Append newly added books to priorityOrder ──
  // Runs when selectedBooks changes after initial load. New books go to the end.
  useEffect(() => {
    if (!prioritiesLoaded) return
    setPriorityOrder(prev => {
      const added = selectedBooks.filter(b => !prev.includes(b))
      if (added.length === 0) return prev
      return [...prev, ...added]
    })
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

  // ── Keyboard + scroll lock ──
  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  // ── Unsubscribe / re-subscribe ──
  async function handleToggle(bookName: string) {
    const wasUnsubscribed = localUnsubscribed.has(bookName)
    // Optimistic update
    setLocalUnsubscribed(prev => {
      const next = new Set(prev)
      if (wasUnsubscribed) next.delete(bookName)
      else next.add(bookName)
      return next
    })
    try {
      await onToggleBook(bookName)
      const msg = wasUnsubscribed
        ? `Вы успешно записал:ись на «${bookName}»`
        : `Вы успешно отписал:ись от «${bookName}»`
      setToast({ message: msg, type: 'success' })
    } catch {
      // Rollback local state
      setLocalUnsubscribed(prev => {
        const next = new Set(prev)
        if (wasUnsubscribed) next.add(bookName)
        else next.delete(bookName)
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
          body: JSON.stringify({ books: booksToSave }),
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
    savePriorities(newOrder, localUnsubscribed)
  }

  // ── Withdraw submission ──
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

  // ── Save contacts (Profile tab) ──
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

  // ── Language toggle ──
  function handleLanguageToggle(code: string) {
    if (!languagesLoaded) return
    const current = languages ?? []
    const next = current.includes(code)
      ? current.filter(c => c !== code)
      : [...current, code]
    setLanguages(next)
    setLanguagesNeverSaved(false)
    // Debounced auto-save
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

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 5 },
    })
  )

  const displayName = session?.user?.name ?? session?.user?.email ?? ''
  const profileUnchanged = name.trim() === (effectiveUser?.name ?? '') && contacts.trim() === (effectiveUser?.contacts ?? '')

  // ─────────────────────────────────────────────
  // Shared styles
  // ─────────────────────────────────────────────
  const sectionLabel: React.CSSProperties = {
    fontFamily: 'var(--nd-sans), system-ui, sans-serif',
    fontSize: '0.55rem',
    textTransform: 'uppercase',
    letterSpacing: '0.12em',
    color: '#999',
    marginBottom: '0.9rem',
  }

  return (
    <>
      {/* Overlay */}
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

      {/* Drawer */}
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
          background: '#fff',
          borderLeft: '2px solid #111',
          zIndex: 300,
          display: 'flex',
          flexDirection: 'column',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Drawer Header */}
        <div style={{
          padding: '1.25rem 1.5rem 1rem',
          borderBottom: '1px solid #E5E5E5',
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
              color: '#999',
              marginBottom: '0.3rem',
            }}>
              Личный кабинет
            </div>
            <div style={{
              fontFamily: 'var(--nd-serif), Georgia, serif',
              fontSize: '1.3rem',
              color: '#111',
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
              color: '#999',
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

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #E5E5E5', flexShrink: 0 }}>
          {(['signup', 'submitted', 'profile'] as Tab[]).map(tab => {
            const labels: Record<Tab, string> = {
              signup: 'Записал:ась',
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
                  color: activeTab === tab ? '#111' : '#999',
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

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto' }}>

          {/* ── Tab: Записал:ась ── */}
          {activeTab === 'signup' && (
            <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
              {/* Banner — shown until user has sorted at least once */}
              {prioritiesLoaded && !prioritiesSet && selectedBooks.length > 0 && (
                <div style={{
                  padding: '10px 16px', background: '#fff7ed',
                  borderBottom: '1px solid #fed7aa',
                  fontSize: 12, color: '#9a3412', lineHeight: 1.5,
                }}>
                  <strong>Расставь книги по интересу:</strong> перетащи их так, чтобы сверху оказались те, которые хочется прочитать сильнее всего. Это поможет подобрать тебе подходящую группу.
                </div>
              )}

              {/* Sortable list */}
              <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 'calc(1rem + env(safe-area-inset-bottom))' }}>
                {priorityOrder.length === 0 && selectedBooks.length === 0 ? (
                  <div style={{ padding: '24px 16px', color: '#9ca3af', fontSize: 14, textAlign: 'center' }}>
                    Ты пока не записал:ась ни на одну книгу
                  </div>
                ) : (
                  <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                    <SortableContext items={priorityOrder} strategy={verticalListSortingStrategy}>
                      {priorityOrder.map((bookName, index) => {
                        const book = books.find(b => b.name === bookName)
                        if (!book) return null
                        return (
                          <SortableBookItem
                            key={bookName}
                            id={bookName}
                            rank={index + 1}
                            name={bookName}
                            author={book.author}
                            isUnsubscribed={localUnsubscribed.has(bookName)}
                            onToggle={() => handleToggle(bookName)}
                          />
                        )
                      })}
                    </SortableContext>
                  </DndContext>
                )}
              </div>

              {/* Autosave indicator */}
              {prioritiesLoaded && selectedBooks.length > 0 && (
                <div style={{
                  padding: '10px 16px', borderTop: '1px solid #e5e7eb',
                  fontSize: 12, color: '#9ca3af',
                  display: 'flex', justifyContent: 'flex-end',
                }}>
                  {prioritiesSaving === 'saving' && <span>Сохранение...</span>}
                  {prioritiesSaving === 'saved' && <span style={{ color: '#22c55e' }}>✓ Сохранено</span>}
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
                  fontSize: '0.78rem',
                  color: '#bbb',
                  fontStyle: 'italic',
                  textAlign: 'center',
                  padding: '1rem 0',
                }}>
                  Загружаем…
                </p>
              ) : submissions.length === 0 ? (
                <p style={{
                  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                  fontSize: '0.78rem',
                  color: '#bbb',
                  fontStyle: 'italic',
                  textAlign: 'center',
                  padding: '1rem 0',
                }}>
                  Вы ещё не предлагал:и книги
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {submissions.map(sub => (
                    <div key={sub.id} style={{
                      border: '1px solid #E5E5E5',
                      borderLeft: '3px solid #111',
                      padding: '0.75rem',
                    }}>
                      <div style={{
                        fontFamily: 'var(--nd-serif), Georgia, serif',
                        fontSize: '0.875rem',
                        color: '#111',
                        fontWeight: 700,
                        letterSpacing: '-0.01em',
                        lineHeight: 1.3,
                      }}>
                        {sub.title}
                      </div>
                      <div style={{
                        fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                        fontSize: '0.7rem',
                        color: '#666',
                        marginTop: '0.15rem',
                        marginBottom: '0.5rem',
                      }}>
                        {sub.author}{sub.pages ? ` · ${sub.pages} стр.` : ''}
                      </div>
                      <StatusBadge status={sub.status} />
                      {sub.status === 'rejected' && sub.rejectionReason && (
                        <div style={{
                          fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                          fontSize: '0.68rem',
                          color: '#999',
                          marginTop: '0.4rem',
                          fontStyle: 'italic',
                          lineHeight: 1.4,
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
                              color: withdrawingId === sub.id ? '#ccc' : '#bbb',
                              background: 'none',
                              border: 'none',
                              cursor: withdrawingId === sub.id ? 'default' : 'pointer',
                              padding: 0,
                              textDecoration: 'underline',
                            }}
                          >
                            {withdrawingId === sub.id ? 'Отзываем…' : 'Отозвать'}
                          </button>
                          {withdrawFailedId === sub.id && (
                            <span style={{
                              fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                              fontSize: '0.65rem',
                              color: '#c00',
                              marginLeft: '0.5rem',
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

              {/* Contacts form */}
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
                      color: '#666',
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
                        display: 'block',
                        width: '100%',
                        padding: '0.55rem 0.7rem',
                        fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                        fontSize: '0.85rem',
                        color: '#111',
                        background: '#fff',
                        border: '1px solid #E5E5E5',
                        borderBottom: '2px solid #111',
                        outline: 'none',
                        boxSizing: 'border-box',
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
                      color: '#666',
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
                        display: 'block',
                        width: '100%',
                        padding: '0.55rem 0.7rem',
                        fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                        fontSize: '0.85rem',
                        color: telegramLocked ? '#666' : '#111',
                        background: telegramLocked ? '#F5F5F5' : '#fff',
                        border: '1px solid #E5E5E5',
                        borderBottom: telegramLocked ? '2px solid #ccc' : '2px solid #111',
                        outline: 'none',
                        cursor: telegramLocked ? 'default' : 'text',
                        boxSizing: 'border-box',
                      }}
                    />
                    <div style={{
                      fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                      fontSize: '0.62rem',
                      color: '#aaa',
                      marginTop: '0.3rem',
                      fontStyle: 'italic',
                    }}>
                      Организатор свяжется с вами для записи в группу
                    </div>
                  </div>
                  {saveError && (
                    <p style={{
                      fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                      fontSize: '0.8rem',
                      color: '#c00',
                      marginBottom: '1rem',
                    }}>
                      {saveError}
                    </p>
                  )}
                  <button
                    type="submit"
                    disabled={saving || profileUnchanged}
                    style={{
                      width: '100%',
                      padding: '0.65rem 1rem',
                      fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                      fontSize: '0.65rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      background: saving ? '#E5E5E5' : saveSuccess ? '#2A6E2A' : profileUnchanged ? '#E5E5E5' : '#111',
                      color: (saving || profileUnchanged) ? '#999' : '#fff',
                      border: `1px solid ${profileUnchanged ? '#ccc' : '#111'}`,
                      cursor: (saving || profileUnchanged) ? 'default' : 'pointer',
                      transition: 'background 0.15s, color 0.15s',
                    }}
                  >
                    {saving ? 'Сохраняем…' : saveSuccess ? 'Сохранено ✓' : 'Сохранить'}
                  </button>
                </form>
              </div>

              {/* Language preferences */}
              <div style={{ marginBottom: '1.5rem' }}>
                <div style={sectionLabel}>Языки чтения</div>
                {languagesNeverSaved && languagesLoaded && (
                  <p style={{
                    fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                    fontSize: '0.72rem',
                    color: '#aaa',
                    fontStyle: 'italic',
                    marginBottom: '0.75rem',
                  }}>
                    Выберите языки чтения
                  </p>
                )}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                  {LANGUAGES_PRIMARY.map(lang => (
                    <LangButton
                      key={lang.code}
                      lang={lang}
                      active={(languages ?? []).includes(lang.code)}
                      disabled={!languagesLoaded}
                      onToggle={handleLanguageToggle}
                    />
                  ))}
                  {LANGUAGES_EXTRA.filter(lang =>
                    showExtraLanguages || (languages ?? []).includes(lang.code)
                  ).map(lang => (
                    <LangButton
                      key={lang.code}
                      lang={lang}
                      active={(languages ?? []).includes(lang.code)}
                      disabled={!languagesLoaded}
                      onToggle={handleLanguageToggle}
                    />
                  ))}
                  <button
                    onClick={() => setShowExtraLanguages(v => !v)}
                    style={{
                      fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                      fontSize: '0.72rem',
                      color: '#999',
                      background: 'none',
                      border: '1px dashed #ccc',
                      padding: '0.3rem 0.65rem',
                      cursor: 'pointer',
                    }}
                  >
                    {showExtraLanguages ? 'скрыть' : '+ ещё'}
                  </button>
                </div>
              </div>

              {/* Sign out */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.65rem 0',
                marginBottom: '0.75rem',
                gap: '0.75rem',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                  <svg viewBox="0 0 24 24" fill="none" width="13" height="13" style={{ flexShrink: 0 }}>
                    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                  </svg>
                  <span style={{
                    fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                    fontSize: '0.78rem',
                    color: '#666',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}>
                    {session?.user?.email}
                  </span>
                </div>
                <button
                  onClick={() => signOut({ callbackUrl: '/' })}
                  style={{
                    fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                    fontSize: '0.65rem',
                    color: '#999',
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    flexShrink: 0,
                    whiteSpace: 'nowrap',
                    textDecoration: 'underline',
                  }}
                >
                  Выйти
                </button>
              </div>

              {/* Delete account */}
              {effectiveUser && (
                <div style={{ textAlign: 'center' }}>
                  <button
                    type="button"
                    onClick={handleDeleteAccount}
                    style={{
                      fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                      fontSize: '0.7rem',
                      color: '#999',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
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
        {/* No footer — sign-out moved to Profile tab */}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed',
          bottom: '1.5rem',
          right: '1.5rem',
          zIndex: 9999,
          background: toast.type === 'error' ? '#c00' : '#111',
          color: '#fff',
          fontFamily: 'var(--nd-sans), system-ui, sans-serif',
          fontSize: '0.8rem',
          padding: '0.65rem 1rem',
          maxWidth: '300px',
          lineHeight: 1.4,
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
        background: disabled ? '#f5f5f5' : active ? '#111' : '#fff',
        color: disabled ? '#ccc' : active ? '#fff' : '#111',
        border: `1px solid ${disabled ? '#e5e5e5' : active ? '#111' : '#E5E5E5'}`,
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
      ...(styles[status] ?? { color: '#666', borderColor: '#ccc', background: '#f5f5f5' }),
    }}>
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}
