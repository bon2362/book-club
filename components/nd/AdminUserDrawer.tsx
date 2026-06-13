'use client'

import { useState, useEffect } from 'react'
import type { AdminUserDetails } from '@/lib/admin-users'
import type { PersonalBookStatus } from '@/lib/signup-books'

interface Props {
  isOpen: boolean
  data: AdminUserDetails | null
  loading: boolean
  onClose: () => void
  onRemoveSignup: (bookId: string, bookName: string) => void
  onDeleteUser: () => void
  onMergeUser: (targetUserId: string, reason: string) => Promise<void>
  onOpenSubmission: (submissionId: string) => void
  onChangeStatus: (bookId: string, status: PersonalBookStatus) => void
  mergeLoading: boolean
}

const sans = 'var(--nd-sans), system-ui, sans-serif'
const serif = 'var(--nd-serif), Georgia, serif'

const sectionTitle: React.CSSProperties = {
  fontFamily: sans,
  fontSize: '0.68rem',
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: 'var(--text-secondary)',
  margin: 0,
}

const pill = (bg: string, color: string): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0.12rem 0.45rem',
  borderRadius: 10,
  background: bg,
  color,
  fontFamily: sans,
  fontSize: '0.68rem',
  lineHeight: 1.4,
})

function formatDate(value: string | null) {
  if (!value) return '—'
  return new Date(value).toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function authLabel(provider: string | null) {
  if (!provider) return '—'
  if (provider === 'telegram-preauth') return 'telegram'
  if (provider === 'google-one-tap') return 'google one tap'
  return provider
}

function lastAuthLabel(provider: string | null) {
  return `последний способ: ${authLabel(provider)}`
}

const adminBadge: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  padding: '0.1rem 0.45rem',
  borderRadius: 2,
  background: 'var(--text)',
  color: 'var(--bg)',
  fontFamily: sans,
  fontSize: '0.62rem',
  fontWeight: 700,
  lineHeight: 1.35,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}

type MergeTargetLookup =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'found'; user: AdminUserDetails['user'] }
  | { status: 'missing'; message: string }
  | { status: 'error'; message: string }

function BookStatusChip({
  bookName,
  rankLabel,
  isRanked,
  isMenuOpen,
  onToggleMenu,
  onStatusSelect,
  onRemove,
}: {
  bookId: string
  bookName: string
  rankLabel?: string | number
  isRanked?: boolean
  isMenuOpen: boolean
  onToggleMenu: () => void
  onStatusSelect: (status: PersonalBookStatus) => void
  onRemove: () => void
}) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', background: 'var(--bg-elevated)', borderRadius: 2, overflow: 'visible', fontSize: '0.78rem' }}>
      {rankLabel !== undefined && (
        <span style={{ background: isRanked ? 'var(--text)' : 'var(--border)', color: isRanked ? 'var(--bg)' : 'var(--text-muted)', padding: '0.22rem 0.45rem', fontWeight: 700, borderRadius: '2px 0 0 2px' }}>
          {rankLabel}
        </span>
      )}
      <button
        onClick={onToggleMenu}
        style={{ background: 'none', border: 'none', padding: '0.22rem 0.5rem', cursor: 'pointer', fontFamily: sans, fontSize: '0.78rem', color: 'var(--text)' }}
      >
        {bookName}
      </button>
      <button onClick={onRemove} title="Снять запись" style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 0.4rem' }}>×</button>
      {isMenuOpen && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, background: 'var(--bg-input)', border: '1px solid var(--border)', boxShadow: '0 2px 8px rgba(0,0,0,0.12)', zIndex: 10, minWidth: 160, borderRadius: 2 }}>
          {([
            { value: null, label: 'Записал:ась' },
            { value: 'reading', label: 'Читаю' },
            { value: 'read', label: 'Прочитал:а' },
          ] as { value: PersonalBookStatus; label: string }[]).map(opt => (
            <button
              key={String(opt.value)}
              onClick={() => { onStatusSelect(opt.value); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '0.4rem 0.75rem', fontFamily: sans, fontSize: '0.75rem', cursor: 'pointer', color: 'var(--text)' }}
              data-testid={`admin-status-option-${opt.value ?? 'null'}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </span>
  )
}

export default function AdminUserDrawer({
  isOpen,
  data,
  loading,
  onClose,
  onRemoveSignup,
  onDeleteUser,
  onMergeUser,
  onOpenSubmission,
  onChangeStatus,
  mergeLoading,
}: Props) {
  const [openMenuBookId, setOpenMenuBookId] = useState<string | null>(null)
  const [mergeTargetUserId, setMergeTargetUserId] = useState('')
  const [mergeReason, setMergeReason] = useState('')
  const [copiedUserId, setCopiedUserId] = useState(false)
  const [mergeError, setMergeError] = useState('')
  const [mergeTargetLookup, setMergeTargetLookup] = useState<MergeTargetLookup>({ status: 'idle' })

  useEffect(() => {
    if (!isOpen) return
    const original = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = original
      window.removeEventListener('keydown', onKey)
    }
  }, [isOpen, onClose])

  useEffect(() => {
    if (isOpen) return
    setMergeTargetUserId('')
    setMergeReason('')
    setCopiedUserId(false)
    setMergeError('')
    setMergeTargetLookup({ status: 'idle' })
  }, [isOpen])

  const user = data?.user

  // Три группы по personalStatus
  const nullBooks = (data?.signupBooks ?? []).filter(b => b.personalStatus === null)
  const readingBooks = (data?.signupBooks ?? []).filter(b => b.personalStatus === 'reading')
  const readBooks = (data?.signupBooks ?? []).filter(b => b.personalStatus === 'read')

  // Для nullBooks — сортировка по приоритету (как раньше):
  const priorityMap = new Map((data?.priorities ?? []).map(row => [row.bookId, row.rank]))
  const rankedNull = nullBooks
    .filter(b => priorityMap.has(b.bookId))
    .sort((a, b2) => priorityMap.get(a.bookId)! - priorityMap.get(b2.bookId)!)
  const unrankedNull = nullBooks.filter(b => !priorityMap.has(b.bookId))
  const sortedNullBooks = user?.prioritiesSet ? [...rankedNull, ...unrankedNull] : nullBooks
  const trimmedMergeTargetUserId = mergeTargetUserId.trim()
  const canSubmitMerge = Boolean(trimmedMergeTargetUserId) && mergeTargetLookup.status === 'found' && !mergeLoading

  useEffect(() => {
    setMergeError('')
    if (!isOpen || !user) {
      setMergeTargetLookup({ status: 'idle' })
      return
    }
    if (!trimmedMergeTargetUserId) {
      setMergeTargetLookup({ status: 'idle' })
      return
    }
    if (trimmedMergeTargetUserId === user.id) {
      setMergeTargetLookup({ status: 'error', message: 'Нельзя слить пользователя в самого себя.' })
      return
    }

    const controller = new AbortController()
    setMergeTargetLookup({ status: 'loading' })
    fetch(`/api/admin/users/${encodeURIComponent(trimmedMergeTargetUserId)}`, { signal: controller.signal })
      .then(async res => {
        if (res.status === 404) {
          setMergeTargetLookup({ status: 'missing', message: 'Пользователь с таким ID не найден.' })
          return
        }
        if (!res.ok) {
          const payload = await res.json().catch(() => null) as { error?: string } | null
          setMergeTargetLookup({ status: 'error', message: payload?.error || 'Не удалось проверить ID пользователя.' })
          return
        }
        const payload = await res.json() as { success?: boolean; data?: AdminUserDetails }
        if (!payload.success || !payload.data?.user) {
          setMergeTargetLookup({ status: 'error', message: 'Не удалось проверить ID пользователя.' })
          return
        }
        setMergeTargetLookup({ status: 'found', user: payload.data.user })
      })
      .catch(error => {
        if ((error as Error).name === 'AbortError') return
        setMergeTargetLookup({ status: 'error', message: 'Не удалось проверить ID пользователя: ошибка сети.' })
      })

    return () => controller.abort()
  }, [isOpen, trimmedMergeTargetUserId, user])

  async function copyUserId(userId: string) {
    await navigator.clipboard.writeText(userId)
    setCopiedUserId(true)
  }

  async function submitMerge() {
    setMergeError('')
    try {
      await onMergeUser(trimmedMergeTargetUserId, mergeReason.trim())
    } catch (error) {
      setMergeError(error instanceof Error ? error.message : 'Не удалось слить пользователей')
    }
  }

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.35)',
          zIndex: 200,
          opacity: isOpen ? 1 : 0,
          pointerEvents: isOpen ? 'auto' : 'none',
          transition: 'opacity 0.25s ease',
        }}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={user ? `Карточка пользователя ${user.name || user.contactEmail || user.telegramDisplay || user.id}` : 'Карточка пользователя'}
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: 640,
          maxWidth: '100vw',
          height: '100dvh',
          background: 'var(--bg-input)',
          borderLeft: '2px solid var(--text)',
          zIndex: 300,
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          visibility: isOpen ? 'visible' : 'hidden',
          transition: 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <header style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
          <div>
            <div style={{ fontFamily: sans, fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.16em', color: 'var(--text-muted)' }}>
              Карточка пользователя
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
              <h2 style={{ fontFamily: serif, fontSize: '1.35rem', margin: 0, color: 'var(--text)' }}>
                {loading ? 'Загрузка…' : user?.name || user?.contactEmail || user?.telegramDisplay || 'Пользователь'}
              </h2>
              {user?.isAdmin && <span style={adminBadge}>Admin</span>}
            </div>
          </div>
          <button onClick={onClose} aria-label="Закрыть" style={{ background: 'none', border: 'none', fontSize: '1.5rem', color: 'var(--text-secondary)', cursor: 'pointer', height: 32 }}>
            ×
          </button>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', fontFamily: sans }}>
          {loading && <p style={{ color: 'var(--text-secondary)' }}>Загрузка данных…</p>}
          {!loading && !data && <p style={{ color: 'var(--text-muted)' }}>Не удалось загрузить пользователя.</p>}
          {data && user && (
            <>
              <section style={{ marginBottom: '1.6rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.7rem' }}>
                  <h3 style={sectionTitle}>Профиль</h3>
                  <span style={pill('var(--border-subtle)', 'var(--text-secondary)')}>{lastAuthLabel(user.authProvider)}</span>
                </div>
                <dl style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '0.45rem 0.9rem', margin: 0, fontSize: '0.82rem' }}>
                  <dt style={{ color: 'var(--text-muted)' }}>Имя</dt><dd style={{ margin: 0 }}>{user.name || '—'}</dd>
                  <dt style={{ color: 'var(--text-muted)' }}>Telegram</dt><dd style={{ margin: 0 }}>{user.telegramDisplay || '—'}</dd>
                  <dt style={{ color: 'var(--text-muted)' }}>Email</dt><dd style={{ margin: 0 }}>{user.contactEmail || '—'}</dd>
                  <dt style={{ color: 'var(--text-muted)' }}>Языки</dt><dd style={{ margin: 0 }}>{user.languages.length ? user.languages.join(', ') : '—'}</dd>
                  <dt style={{ color: 'var(--text-muted)' }}>Последняя активность</dt><dd style={{ margin: 0 }}>{formatDate(user.lastActivityAt)}</dd>
                  <dt style={{ color: 'var(--text-muted)' }}>Дата создания</dt><dd style={{ margin: 0 }}>{formatDate(user.createdAt)}</dd>
                  <dt style={{ color: 'var(--text-muted)' }}>ID</dt>
                  <dd style={{ margin: 0 }}>
                    <button
                      type="button"
                      onClick={() => { void copyUserId(user.id) }}
                      aria-label={`Скопировать ID пользователя ${user.id}`}
                      style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', cursor: 'pointer', fontFamily: sans, fontSize: '0.76rem', padding: '0.18rem 0.45rem', textAlign: 'left', wordBreak: 'break-all' }}
                    >
                      {user.id}
                    </button>
                    {copiedUserId && <span style={{ marginLeft: '0.45rem', color: 'var(--text-muted)', fontSize: '0.72rem' }}>скопировано</span>}
                  </dd>
                </dl>
                <button onClick={onDeleteUser} style={{ marginTop: '0.9rem', background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-muted)', padding: '0.35rem 0.75rem', cursor: 'pointer', fontFamily: sans, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Удалить пользователя
                </button>
              </section>

              <section style={{ marginBottom: '1.6rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}>
                <h3 style={{ ...sectionTitle, marginBottom: '0.5rem' }}>Слить дубль</h3>
                <div style={{ display: 'grid', gap: '0.6rem' }}>
                  <label style={{ display: 'grid', gap: '0.25rem' }}>
                    <span style={{ fontFamily: sans, fontSize: '0.64rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)' }}>ID аккаунта, который оставить</span>
                    <input
                      value={mergeTargetUserId}
                      onChange={event => setMergeTargetUserId(event.target.value)}
                      placeholder="Вставьте ID основного аккаунта"
                      style={{ fontFamily: sans, fontSize: '0.8rem', color: 'var(--text)', border: '1px solid var(--border)', borderBottom: '2px solid var(--border-strong)', padding: '0.4rem 0.5rem', background: 'var(--bg-input)' }}
                    />
                    {mergeTargetLookup.status === 'loading' && (
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>Ищу пользователя…</span>
                    )}
                    {mergeTargetLookup.status === 'found' && (
                      <div style={{ border: '1px solid var(--border)', borderLeft: '2px solid var(--success)', padding: '0.45rem 0.55rem', display: 'grid', gap: '0.15rem', background: 'var(--bg)' }}>
                        <span style={{ color: 'var(--text)', fontSize: '0.78rem', fontWeight: 700 }}>
                          {mergeTargetLookup.user.name || mergeTargetLookup.user.contactEmail || mergeTargetLookup.user.telegramDisplay || 'Пользователь'}
                        </span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.72rem', wordBreak: 'break-all' }}>{mergeTargetLookup.user.id}</span>
                      </div>
                    )}
                    {(mergeTargetLookup.status === 'missing' || mergeTargetLookup.status === 'error') && (
                      <span style={{ color: 'var(--accent)', fontSize: '0.72rem' }}>{mergeTargetLookup.message}</span>
                    )}
                  </label>
                  <label style={{ display: 'grid', gap: '0.25rem' }}>
                    <span style={{ fontFamily: sans, fontSize: '0.64rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)' }}>Причина</span>
                    <textarea
                      value={mergeReason}
                      onChange={event => setMergeReason(event.target.value)}
                      rows={2}
                      placeholder="Опционально: один участник вошёл через Google и Telegram"
                      style={{ fontFamily: sans, fontSize: '0.8rem', lineHeight: 1.45, color: 'var(--text)', border: '1px solid var(--border)', borderBottom: '2px solid var(--border-strong)', padding: '0.45rem 0.5rem', background: 'var(--bg-input)', resize: 'vertical' }}
                    />
                  </label>
                  <button
                    onClick={() => { void submitMerge() }}
                    disabled={!canSubmitMerge}
                    style={{ justifySelf: 'start', background: 'transparent', border: '1px solid var(--border)', color: canSubmitMerge ? 'var(--text)' : 'var(--text-muted)', padding: '0.35rem 0.75rem', cursor: canSubmitMerge ? 'pointer' : 'default', fontFamily: sans, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}
                  >
                    {mergeLoading ? 'Слияние…' : 'Merge to user'}
                  </button>
                  {mergeError && (
                    <div role="alert" style={{ border: '1px solid var(--border)', borderLeft: '2px solid var(--accent)', color: 'var(--text)', padding: '0.45rem 0.55rem', fontSize: '0.76rem', lineHeight: 1.45 }}>
                      {mergeError}
                    </div>
                  )}
                </div>
              </section>

              <section style={{ marginBottom: '1.6rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.45rem' }}>
                  <h3 style={sectionTitle}>Записи на книги</h3>
                  <span style={user.prioritiesSet ? pill('var(--bg-elevated)', 'var(--success)') : pill('var(--border-subtle)', 'var(--text-secondary)')}>
                    {user.prioritiesSet ? 'приоритеты расставлены' : 'без приоритетов'}
                  </span>
                </div>

                {/* Под-секция: Записал:ась */}
                {sortedNullBooks.length > 0 && (
                  <div style={{ marginBottom: '0.75rem' }}>
                    <div style={{ fontFamily: sans, fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                      Записал:ась
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                      {sortedNullBooks.map(row => {
                        const rank = priorityMap.get(row.bookId)
                        const isRanked = user.prioritiesSet && rank !== undefined
                        const rankLabel = !user.prioritiesSet ? '?' : rank ?? '+'
                        return (
                          <BookStatusChip
                            key={row.bookId}
                            bookId={row.bookId}
                            bookName={row.bookName}
                            rankLabel={rankLabel}
                            isRanked={isRanked}
                            isMenuOpen={openMenuBookId === row.bookId}
                            onToggleMenu={() => setOpenMenuBookId(prev => prev === row.bookId ? null : row.bookId)}
                            onStatusSelect={(s) => { setOpenMenuBookId(null); onChangeStatus(row.bookId, s) }}
                            onRemove={() => onRemoveSignup(row.bookId, row.bookName)}
                          />
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Под-секция: Читаю */}
                {readingBooks.length > 0 && (
                  <div style={{ marginBottom: '0.75rem' }}>
                    <div style={{ fontFamily: sans, fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                      Читаю
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                      {readingBooks.map(row => (
                        <BookStatusChip
                          key={row.bookId}
                          bookId={row.bookId}
                          bookName={row.bookName}
                          isMenuOpen={openMenuBookId === row.bookId}
                          onToggleMenu={() => setOpenMenuBookId(prev => prev === row.bookId ? null : row.bookId)}
                          onStatusSelect={(s) => { setOpenMenuBookId(null); onChangeStatus(row.bookId, s) }}
                          onRemove={() => onRemoveSignup(row.bookId, row.bookName)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Под-секция: Прочитал:а */}
                {readBooks.length > 0 && (
                  <div style={{ marginBottom: '0.75rem' }}>
                    <div style={{ fontFamily: sans, fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-muted)', marginBottom: '0.35rem' }}>
                      Прочитал:а
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                      {readBooks.map(row => (
                        <BookStatusChip
                          key={row.bookId}
                          bookId={row.bookId}
                          bookName={row.bookName}
                          isMenuOpen={openMenuBookId === row.bookId}
                          onToggleMenu={() => setOpenMenuBookId(prev => prev === row.bookId ? null : row.bookId)}
                          onStatusSelect={(s) => { setOpenMenuBookId(null); onChangeStatus(row.bookId, s) }}
                          onRemove={() => onRemoveSignup(row.bookId, row.bookName)}
                        />
                      ))}
                    </div>
                  </div>
                )}

                {/* Пустое состояние */}
                {(data?.signupBooks ?? []).length === 0 && (
                  <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.82rem' }}>Нет записей</p>
                )}
              </section>

              <section style={{ marginBottom: '1.6rem' }}>
                <h3 style={{ ...sectionTitle, marginBottom: '0.5rem' }}>Предложения книг</h3>
                {data.submissions.length === 0 ? <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.82rem' }}>Нет предложений</p> : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {data.submissions.map(sub => (
                      <li key={sub.id} style={{ padding: '0.55rem 0', borderBottom: '1px solid var(--border-subtle)', display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center' }}>
                        <div><div>{sub.title}</div><div style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{sub.author} · {formatDate(sub.createdAt)}</div></div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={pill('var(--bg-elevated)', sub.status === 'approved' ? 'var(--success)' : sub.status === 'rejected' ? 'var(--accent)' : 'var(--text-secondary)')}>{sub.status}</span>
                          <button onClick={() => onOpenSubmission(sub.id)} style={{ background: 'none', border: 'none', color: 'var(--text-secondary)', cursor: 'pointer', fontFamily: sans, fontSize: '0.72rem', padding: 0 }}>
                            открыть заявку →
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section>
                <h3 style={{ ...sectionTitle, marginBottom: '0.5rem' }}>Фидбеки</h3>
                {data.feedback.length === 0 ? <p style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontSize: '0.82rem' }}>Нет фидбеков</p> : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {data.feedback.map(item => (
                      <li key={item.id} style={{ padding: '0.65rem 0', borderBottom: '1px solid var(--border-subtle)' }}>
                        <div style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginBottom: '0.25rem' }}>{formatDate(item.createdAt)}</div>
                        <div style={{ whiteSpace: 'pre-wrap', color: 'var(--text-body)', fontSize: '0.84rem' }}>{item.message}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </aside>
    </>
  )
}
