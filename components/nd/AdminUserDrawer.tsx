'use client'

import { useState, useEffect } from 'react'
import type { AdminUserDetails } from '@/lib/admin-users'

interface Props {
  isOpen: boolean
  data: AdminUserDetails | null
  loading: boolean
  onClose: () => void
  onRemoveSignup: (bookId: string, bookName: string) => void
  onDeleteUser: () => void
  onOpenSubmission: (submissionId: string) => void
  onChangeStatus: (bookId: string, status: string | null) => void
}

const sans = 'var(--nd-sans), system-ui, sans-serif'
const serif = 'var(--nd-serif), Georgia, serif'

const sectionTitle: React.CSSProperties = {
  fontFamily: sans,
  fontSize: '0.68rem',
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: '#666',
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
  background: '#111',
  color: '#fff',
  fontFamily: sans,
  fontSize: '0.62rem',
  fontWeight: 700,
  lineHeight: 1.35,
  textTransform: 'uppercase',
  letterSpacing: '0.06em',
}

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
  onStatusSelect: (status: string | null) => void
  onRemove: () => void
}) {
  return (
    <span style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', background: '#F5F5F5', borderRadius: 2, overflow: 'visible', fontSize: '0.78rem' }}>
      {rankLabel !== undefined && (
        <span style={{ background: isRanked ? '#111' : '#E5E5E5', color: isRanked ? '#fff' : '#AAA', padding: '0.22rem 0.45rem', fontWeight: 700, borderRadius: '2px 0 0 2px' }}>
          {rankLabel}
        </span>
      )}
      <button
        onClick={onToggleMenu}
        style={{ background: 'none', border: 'none', padding: '0.22rem 0.5rem', cursor: 'pointer', fontFamily: sans, fontSize: '0.78rem', color: '#111' }}
      >
        {bookName}
      </button>
      <button onClick={onRemove} title="Снять запись" style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', padding: '0 0.4rem' }}>×</button>
      {isMenuOpen && (
        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, background: '#fff', border: '1px solid #E5E5E5', boxShadow: '0 2px 8px rgba(0,0,0,0.12)', zIndex: 10, minWidth: 160, borderRadius: 2 }}>
          {[
            { value: null, label: 'Записал:ась' },
            { value: 'reading', label: 'Читаю' },
            { value: 'read', label: 'Прочитал:а' },
          ].map(opt => (
            <button
              key={String(opt.value)}
              onClick={() => { onStatusSelect(opt.value); }}
              style={{ display: 'block', width: '100%', textAlign: 'left', background: 'none', border: 'none', padding: '0.4rem 0.75rem', fontFamily: sans, fontSize: '0.75rem', cursor: 'pointer', color: '#111' }}
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

export default function AdminUserDrawer({ isOpen, data, loading, onClose, onRemoveSignup, onDeleteUser, onOpenSubmission, onChangeStatus }: Props) {
  const [openMenuBookId, setOpenMenuBookId] = useState<string | null>(null)

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
          background: '#fff',
          borderLeft: '2px solid #111',
          zIndex: 300,
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          visibility: isOpen ? 'visible' : 'hidden',
          transition: 'transform 0.28s cubic-bezier(0.4, 0, 0.2, 1)',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <header style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #E5E5E5', display: 'flex', justifyContent: 'space-between', gap: '1rem' }}>
          <div>
            <div style={{ fontFamily: sans, fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.16em', color: '#999' }}>
              Карточка пользователя
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.55rem', flexWrap: 'wrap', marginTop: '0.2rem' }}>
              <h2 style={{ fontFamily: serif, fontSize: '1.35rem', margin: 0, color: '#111' }}>
                {loading ? 'Загрузка…' : user?.name || user?.contactEmail || user?.telegramDisplay || 'Пользователь'}
              </h2>
              {user?.isAdmin && <span style={adminBadge}>Admin</span>}
            </div>
          </div>
          <button onClick={onClose} aria-label="Закрыть" style={{ background: 'none', border: 'none', fontSize: '1.5rem', color: '#666', cursor: 'pointer', height: 32 }}>
            ×
          </button>
        </header>

        <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem', fontFamily: sans }}>
          {loading && <p style={{ color: '#666' }}>Загрузка данных…</p>}
          {!loading && !data && <p style={{ color: '#999' }}>Не удалось загрузить пользователя.</p>}
          {data && user && (
            <>
              <section style={{ marginBottom: '1.6rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.7rem' }}>
                  <h3 style={sectionTitle}>Профиль</h3>
                  <span style={pill('#F0F0F0', '#555')}>{lastAuthLabel(user.authProvider)}</span>
                </div>
                <dl style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: '0.45rem 0.9rem', margin: 0, fontSize: '0.82rem' }}>
                  <dt style={{ color: '#999' }}>Имя</dt><dd style={{ margin: 0 }}>{user.name || '—'}</dd>
                  <dt style={{ color: '#999' }}>Telegram</dt><dd style={{ margin: 0 }}>{user.telegramDisplay || '—'}</dd>
                  <dt style={{ color: '#999' }}>Email</dt><dd style={{ margin: 0 }}>{user.contactEmail || '—'}</dd>
                  <dt style={{ color: '#999' }}>Языки</dt><dd style={{ margin: 0 }}>{user.languages.length ? user.languages.join(', ') : '—'}</dd>
                  <dt style={{ color: '#999' }}>Последняя активность</dt><dd style={{ margin: 0 }}>{formatDate(user.lastActivityAt)}</dd>
                  <dt style={{ color: '#999' }}>Дата создания</dt><dd style={{ margin: 0 }}>{formatDate(user.createdAt)}</dd>
                </dl>
                <button onClick={onDeleteUser} style={{ marginTop: '0.9rem', background: 'transparent', border: '1px solid #E5E5E5', color: '#999', padding: '0.35rem 0.75rem', cursor: 'pointer', fontFamily: sans, fontSize: '0.68rem', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Удалить пользователя
                </button>
              </section>

              <section style={{ marginBottom: '1.6rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.45rem' }}>
                  <h3 style={sectionTitle}>Записи на книги</h3>
                  <span style={user.prioritiesSet ? pill('#E2F0EA', '#2D6A4F') : pill('#F0F0F0', '#777')}>
                    {user.prioritiesSet ? 'приоритеты расставлены' : 'без приоритетов'}
                  </span>
                </div>

                {/* Под-секция: Записал:ась */}
                {sortedNullBooks.length > 0 && (
                  <div style={{ marginBottom: '0.75rem' }}>
                    <div style={{ fontFamily: sans, fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#bbb', marginBottom: '0.35rem' }}>
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
                    <div style={{ fontFamily: sans, fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#bbb', marginBottom: '0.35rem' }}>
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
                    <div style={{ fontFamily: sans, fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#bbb', marginBottom: '0.35rem' }}>
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
                  <p style={{ color: '#BBB', fontStyle: 'italic', fontSize: '0.82rem' }}>Нет записей</p>
                )}
              </section>

              <section style={{ marginBottom: '1.6rem' }}>
                <h3 style={{ ...sectionTitle, marginBottom: '0.5rem' }}>Предложения книг</h3>
                {data.submissions.length === 0 ? <p style={{ color: '#BBB', fontStyle: 'italic', fontSize: '0.82rem' }}>Нет предложений</p> : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {data.submissions.map(sub => (
                      <li key={sub.id} style={{ padding: '0.55rem 0', borderBottom: '1px solid #F0F0F0', display: 'flex', justifyContent: 'space-between', gap: '1rem', alignItems: 'center' }}>
                        <div><div>{sub.title}</div><div style={{ color: '#999', fontSize: '0.7rem' }}>{sub.author} · {formatDate(sub.createdAt)}</div></div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                          <span style={pill(sub.status === 'approved' ? '#E2F0EA' : sub.status === 'rejected' ? '#FAE0E0' : '#FFF3DC', '#555')}>{sub.status}</span>
                          <button onClick={() => onOpenSubmission(sub.id)} style={{ background: 'none', border: 'none', color: '#666', cursor: 'pointer', fontFamily: sans, fontSize: '0.72rem', padding: 0 }}>
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
                {data.feedback.length === 0 ? <p style={{ color: '#BBB', fontStyle: 'italic', fontSize: '0.82rem' }}>Нет фидбеков</p> : (
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {data.feedback.map(item => (
                      <li key={item.id} style={{ padding: '0.65rem 0', borderBottom: '1px solid #F0F0F0' }}>
                        <div style={{ color: '#999', fontSize: '0.72rem', marginBottom: '0.25rem' }}>{formatDate(item.createdAt)}</div>
                        <div style={{ whiteSpace: 'pre-wrap', color: '#333', fontSize: '0.84rem' }}>{item.message}</div>
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
