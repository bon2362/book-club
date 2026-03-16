'use client'

import { useState, useEffect } from 'react'
import { signOut, useSession } from 'next-auth/react'
import type { BookWithCover } from '@/lib/books-with-covers'
import type { UserSignup } from '@/lib/signups'

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
}

type Tab = 'signup' | 'submitted' | 'profile'

const STATUS_LABELS: Record<string, string> = {
  pending: 'На рассмотрении',
  approved: 'Одобрена',
  rejected: 'Отклонена',
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
}: Props) {
  const { data: session } = useSession()
  const [activeTab, setActiveTab] = useState<Tab>('signup')
  const [submissions, setSubmissions] = useState<Submission[]>([])
  const [submissionsLoaded, setSubmissionsLoaded] = useState(false)

  const effectiveUser = currentUser ?? savedUser
  const [name, setName] = useState(effectiveUser?.name ?? '')
  const [contacts, setContacts] = useState(effectiveUser?.contacts ?? '')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [saveSuccess, setSaveSuccess] = useState(false)

  useEffect(() => {
    if (effectiveUser) {
      setName(effectiveUser.name)
      setContacts(effectiveUser.contacts)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveUser?.name, effectiveUser?.contacts])

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

  useEffect(() => {
    if (!isOpen) return
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  const signedUpBooks = books.filter(b => selectedBooks.includes(b.name))

  async function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    setSaving(true)
    setSaveError('')
    setSaveSuccess(false)
    try {
      await onSaveContacts(name.trim(), contacts.trim())
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 2000)
    } catch {
      setSaveError('Что-то пошло не так')
    } finally {
      setSaving(false)
    }
  }

  async function handleDeleteAccount() {
    if (!window.confirm('Вы уверены? Это действие нельзя отменить.')) return
    await onDeleteAccount()
  }

  const displayName = session?.user?.name ?? session?.user?.email ?? ''

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
        style={{
          position: 'fixed',
          top: 0,
          right: 0,
          width: '380px',
          maxWidth: '100vw',
          height: '100vh',
          background: '#fff',
          borderLeft: '2px solid #111',
          zIndex: 300,
          display: 'flex',
          flexDirection: 'column',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
        }}
      >
        {/* Header */}
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
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              marginTop: '0.5rem',
              fontFamily: 'var(--nd-sans), system-ui, sans-serif',
              fontSize: '0.6rem',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: '#666',
              border: '1px solid #E5E5E5',
              padding: '0.25rem 0.5rem',
            }}>
              <svg viewBox="0 0 24 24" fill="none" width="12" height="12" style={{ flexShrink: 0 }}>
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Вошли через Google
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
        <div style={{
          display: 'flex',
          borderBottom: '1px solid #E5E5E5',
          flexShrink: 0,
        }}>
          {(['signup', 'submitted', 'profile'] as Tab[]).map(tab => {
            const labels: Record<Tab, string> = { signup: 'Записался', submitted: 'Предложил', profile: 'Профиль' }
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

          {/* Tab: Записался */}
          {activeTab === 'signup' && (
            <div style={{ padding: '1.25rem 1.5rem' }}>
              <div style={{
                fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                fontSize: '0.55rem',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: '#999',
                marginBottom: '0.9rem',
              }}>
                Книги, на которые вы записались
              </div>
              {signedUpBooks.length === 0 ? (
                <p style={{
                  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                  fontSize: '0.78rem',
                  color: '#bbb',
                  fontStyle: 'italic',
                  textAlign: 'center',
                  padding: '1rem 0',
                }}>
                  Вы ещё не записались ни на одну книгу
                </p>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {signedUpBooks.map(book => (
                    <li key={book.id} style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '0.6rem',
                      padding: '0.55rem 0',
                      borderBottom: '1px solid #F0F0F0',
                    }}>
                      <div style={{
                        width: '5px',
                        height: '5px',
                        borderRadius: '50%',
                        background: '#111',
                        flexShrink: 0,
                        marginTop: '0.4rem',
                      }} />
                      <div>
                        <div style={{
                          fontFamily: 'var(--nd-serif), Georgia, serif',
                          fontSize: '0.85rem',
                          color: '#111',
                          lineHeight: 1.4,
                        }}>
                          {book.name}
                        </div>
                        {book.author && (
                          <div style={{
                            fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                            fontSize: '0.7rem',
                            color: '#999',
                            marginTop: '0.1rem',
                          }}>
                            {book.author}
                          </div>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Tab: Предложил */}
          {activeTab === 'submitted' && (
            <div style={{ padding: '1.25rem 1.5rem' }}>
              <div style={{
                fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                fontSize: '0.55rem',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: '#999',
                marginBottom: '0.9rem',
              }}>
                Ваши предложения
              </div>
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
                  Вы ещё не предлагали книги
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
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Tab: Профиль */}
          {activeTab === 'profile' && (
            <div style={{ padding: '1.25rem 1.5rem' }}>
              <div style={{
                fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                fontSize: '0.55rem',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: '#999',
                marginBottom: '0.9rem',
              }}>
                Контактные данные
              </div>
              <form onSubmit={handleSaveProfile} noValidate>
                <div style={{ marginBottom: '1rem' }}>
                  <label
                    htmlFor="pd-name"
                    style={{
                      display: 'block',
                      fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                      fontSize: '0.55rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      color: '#666',
                      marginBottom: '0.35rem',
                    }}
                  >
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
                  <label
                    htmlFor="pd-telegram"
                    style={{
                      display: 'block',
                      fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                      fontSize: '0.55rem',
                      textTransform: 'uppercase',
                      letterSpacing: '0.1em',
                      color: '#666',
                      marginBottom: '0.35rem',
                    }}
                  >
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
                  disabled={saving}
                  style={{
                    width: '100%',
                    padding: '0.65rem 1rem',
                    fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                    fontSize: '0.65rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.1em',
                    background: saving ? '#E5E5E5' : saveSuccess ? '#2A6E2A' : '#111',
                    color: saving ? '#999' : '#fff',
                    border: '1px solid #111',
                    cursor: saving ? 'default' : 'pointer',
                    transition: 'background 0.15s, color 0.15s',
                  }}
                >
                  {saving ? 'Сохраняем…' : saveSuccess ? 'Сохранено ✓' : 'Сохранить'}
                </button>
              </form>

              {effectiveUser && (
                <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
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

        {/* Footer */}
        <div style={{
          padding: '1rem 1.5rem',
          borderTop: '1px solid #E5E5E5',
          flexShrink: 0,
        }}>
          <button
            onClick={() => signOut()}
            style={{
              background: 'none',
              border: 'none',
              fontFamily: 'var(--nd-sans), system-ui, sans-serif',
              fontSize: '0.65rem',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              color: '#bbb',
              cursor: 'pointer',
              padding: 0,
              textDecoration: 'underline',
              transition: 'color 0.15s',
            }}
          >
            Выйти из аккаунта
          </button>
        </div>
      </div>
    </>
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
