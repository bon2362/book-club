'use client'

import { useEffect } from 'react'
import type { AdminUserDetails } from '@/lib/admin-users'

interface Props {
  isOpen: boolean
  data: AdminUserDetails | null
  loading: boolean
  onClose: () => void
  onRemoveSignup: (bookName: string) => void
  onDeleteUser: () => void
  onOpenSubmission: (submissionId: string) => void
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

export default function AdminUserDrawer({ isOpen, data, loading, onClose, onRemoveSignup, onDeleteUser, onOpenSubmission }: Props) {
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
  const priorityMap = new Map((data?.priorities ?? []).map(row => [row.bookName, row.rank]))
  const ranked = (data?.signupBooks ?? [])
    .filter(row => priorityMap.has(row.bookName))
    .sort((a, b) => priorityMap.get(a.bookName)! - priorityMap.get(b.bookName)!)
  const unranked = (data?.signupBooks ?? []).filter(row => !priorityMap.has(row.bookName))
  const sortedBooks = user?.prioritiesSet ? [...ranked, ...unranked] : (data?.signupBooks ?? [])

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
        aria-label={user ? `Карточка пользователя ${user.name || user.email}` : 'Карточка пользователя'}
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
                {loading ? 'Загрузка…' : user?.name || user?.email || 'Пользователь'}
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
                  <dt style={{ color: '#999' }}>Telegram</dt><dd style={{ margin: 0 }}>{user.telegramUsername ? `@${user.telegramUsername}` : user.contacts || '—'}</dd>
                  <dt style={{ color: '#999' }}>Email</dt><dd style={{ margin: 0 }}>{user.email}</dd>
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
                {!user.prioritiesSet && sortedBooks.length > 0 && <div style={{ color: '#AAA', fontStyle: 'italic', fontSize: '0.76rem', marginBottom: '0.5rem' }}>приоритеты ещё не расставлены</div>}
                {user.prioritiesSet && unranked.length > 0 && <div style={{ color: '#AAA', fontStyle: 'italic', fontSize: '0.76rem', marginBottom: '0.5rem' }}>добавил:а книги после расстановки</div>}
                {sortedBooks.length === 0 ? <p style={{ color: '#BBB', fontStyle: 'italic', fontSize: '0.82rem' }}>Нет записей</p> : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    {sortedBooks.map(row => {
                      const rank = priorityMap.get(row.bookName)
                      const label = !user.prioritiesSet ? '?' : rank ?? '+'
                      const isRanked = user.prioritiesSet && rank !== undefined
                      return (
                        <span key={row.bookName} style={{ display: 'inline-flex', alignItems: 'center', background: '#F5F5F5', borderRadius: 2, overflow: 'hidden', fontSize: '0.78rem' }}>
                          <span style={{ background: isRanked ? '#111' : '#E5E5E5', color: isRanked ? '#fff' : '#AAA', padding: '0.22rem 0.45rem', fontWeight: 700 }}>{label}</span>
                          <span style={{ padding: '0.22rem 0.5rem' }}>{row.bookName}</span>
                          <button onClick={() => onRemoveSignup(row.bookName)} title="Снять запись" style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', padding: '0 0.4rem' }}>×</button>
                        </span>
                      )
                    })}
                  </div>
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
