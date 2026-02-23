'use client'

import { useState, useMemo, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import type { Book } from '@/lib/sheets'
import type { UserSignup } from '@/lib/signups'
import { searchBooks } from '@/lib/search'
import { useTheme } from '@/lib/useTheme'
import BookCard from '@/components/BookCard'
import AuthModal from '@/components/AuthModal'
import ContactsForm from '@/components/ContactsForm'

interface Props {
  books: Book[]
  currentUser: UserSignup | null
}

async function saveSelection(name: string, contacts: string, books: string[]) {
  const res = await fetch('/api/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, contacts, selectedBooks: books }),
  })
  if (!res.ok) throw new Error(`Signup failed: ${res.status}`)
}

export default function BooksPage({ books, currentUser }: Props) {
  const { data: session } = useSession()
  const isLoggedIn = !!session?.user?.email
  const isAdmin = !!session?.user?.isAdmin
  const { theme, toggle: toggleTheme } = useTheme()

  const [query, setQuery] = useState('')
  const [filterTag, setFilterTag] = useState('')
  const [filterAuthor, setFilterAuthor] = useState('')
  const [selectedBooks, setSelectedBooks] = useState<string[]>(
    currentUser?.selectedBooks ?? []
  )
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [showContactsForm, setShowContactsForm] = useState(false)
  const [pendingBook, setPendingBook] = useState<Book | null>(null)
  // Track user profile saved in this session (currentUser prop won't update after first save)
  const [savedUser, setSavedUser] = useState<{ name: string; contacts: string } | null>(null)
  const effectiveUser = currentUser ?? savedUser

  // Show contacts form when session loads and user has no profile yet (skip for admin)
  useEffect(() => {
    if (isLoggedIn && !currentUser && !savedUser && !isAdmin) setShowContactsForm(true)
  }, [isLoggedIn, currentUser, savedUser, isAdmin])

  // Collect unique tags and authors for filter dropdowns
  const allTags = useMemo(() => {
    const tagSet = new Set<string>()
    books.forEach(b => b.tags.forEach(t => tagSet.add(t)))
    return Array.from(tagSet).sort()
  }, [books])

  const allAuthors = useMemo(() => {
    const authorSet = new Set<string>()
    books.forEach(b => { if (b.author) authorSet.add(b.author) })
    return Array.from(authorSet).sort()
  }, [books])

  // Apply search + filters
  const filteredBooks = useMemo(() => {
    let result = searchBooks(books, query)
    if (filterTag) {
      result = result.filter(b => b.tags.includes(filterTag))
    }
    if (filterAuthor) {
      result = result.filter(b => b.author === filterAuthor)
    }
    return result
  }, [books, query, filterTag, filterAuthor])

  function handleToggle(book: Book) {
    if (!isLoggedIn) {
      setPendingBook(book)
      setAuthModalOpen(true)
      return
    }
    if (!effectiveUser && !isAdmin) {
      setPendingBook(book)
      setShowContactsForm(true)
      return
    }
    if (!effectiveUser) return // admin without profile — shouldn't happen
    // Logged in and contacts filled — optimistic toggle
    const prev = selectedBooks
    const next = prev.includes(book.name)
      ? prev.filter(n => n !== book.name)
      : [...prev, book.name]
    setSelectedBooks(next)
    saveSelection(effectiveUser.name, effectiveUser.contacts, next).catch(() => {
      setSelectedBooks(prev)
    })
  }

  async function handleContactsSave(name: string, contacts: string) {
    const next = pendingBook
      ? [...selectedBooks, pendingBook.name]
      : selectedBooks
    setSelectedBooks(next)
    try {
      await saveSelection(name, contacts, next)
      setSavedUser({ name, contacts })
      setShowContactsForm(false)
      setPendingBook(null)
    } catch {
      // Revert selection if save failed
      setSelectedBooks(selectedBooks)
    }
  }

  // Shared style tokens
  const labelStyle: React.CSSProperties = {
    fontFamily: "'Georgia', serif",
    fontSize: '0.625rem',
    letterSpacing: '0.1em',
    textTransform: 'uppercase',
    color: 'var(--text-muted)',
  }

  const arrowColor = theme === 'dark' ? '%239E8E80' : '%238C7B6B'
  const selectStyle: React.CSSProperties = {
    fontFamily: "'Georgia', serif",
    fontSize: '0.8125rem',
    color: 'var(--text)',
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderBottom: '2px solid var(--accent)',
    padding: '0.45rem 2rem 0.45rem 0.65rem',
    outline: 'none',
    cursor: 'pointer',
    appearance: 'none' as const,
    WebkitAppearance: 'none' as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='${arrowColor}'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 0.5rem center',
    backgroundSize: '8px',
    minWidth: '140px',
  }

  const inputStyle: React.CSSProperties = {
    fontFamily: "'Georgia', serif",
    fontSize: '0.875rem',
    color: 'var(--text)',
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderBottom: '2px solid var(--accent)',
    padding: '0.55rem 0.85rem',
    outline: 'none',
    width: '100%',
    maxWidth: '400px',
    boxSizing: 'border-box',
    transition: 'border-color 0.15s, background 0.15s',
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg)',
        fontFamily: "'Playfair Display', 'Georgia', 'Times New Roman', serif",
      }}
    >
      {/* ── Header ── */}
      <header
        style={{
          borderBottom: '2px solid var(--text)',
          background: 'var(--bg)',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          boxShadow: '0 2px 8px var(--shadow)',
        }}
      >
        <div
          style={{
            maxWidth: '1280px',
            margin: '0 auto',
            padding: '0 1.5rem',
            height: '64px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          {/* Title + subtitle */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
            <span
              style={{
                fontFamily: "'Playfair Display', 'Georgia', serif",
                fontWeight: 700,
                fontSize: '1.375rem',
                letterSpacing: '-0.02em',
                color: 'var(--text)',
                lineHeight: 1,
              }}
            >
              Долгое наступление
            </span>
            <span
              style={{
                fontFamily: "'Georgia', serif",
                fontStyle: 'italic',
                fontSize: '0.7rem',
                letterSpacing: '0.06em',
                color: 'var(--text-muted)',
                lineHeight: 1,
              }}
            >
              Книжный клуб
            </span>
          </div>

          {/* Right side: theme toggle + auth */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
              title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                color: 'var(--text-muted)',
                cursor: 'pointer',
                padding: '0.3rem 0.55rem',
                fontSize: '0.9rem',
                lineHeight: 1,
                transition: 'border-color 0.15s, color 0.15s',
                flexShrink: 0,
              }}
              onMouseEnter={e => {
                const btn = e.currentTarget as HTMLButtonElement
                btn.style.borderColor = 'var(--accent)'
                btn.style.color = 'var(--accent)'
              }}
              onMouseLeave={e => {
                const btn = e.currentTarget as HTMLButtonElement
                btn.style.borderColor = 'var(--border)'
                btn.style.color = 'var(--text-muted)'
              }}
            >
              {theme === 'dark' ? '☀' : '☾'}
            </button>

            {/* Auth button */}
            {isLoggedIn ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span
                  style={{
                    fontFamily: "'Georgia', serif",
                    fontStyle: 'italic',
                    fontSize: '0.8125rem',
                    color: 'var(--text-secondary)',
                    letterSpacing: '0.01em',
                    maxWidth: '180px',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {session.user?.name ?? session.user?.email}
                </span>
                {effectiveUser && (
                  <button
                    onClick={() => setShowContactsForm(true)}
                    aria-label="Редактировать профиль"
                    title="Редактировать профиль"
                    style={{
                      background: 'transparent',
                      border: 'none',
                      cursor: 'pointer',
                      fontFamily: "'Georgia', serif",
                      fontSize: '0.85rem',
                      color: 'var(--text-muted)',
                      padding: '0.1rem 0.25rem',
                      lineHeight: 1,
                      transition: 'color 0.15s',
                    }}
                    onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--accent)' }}
                    onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-muted)' }}
                  >
                    ✎
                  </button>
                )}
                <button
                  onClick={() => signOut()}
                  style={{
                    fontFamily: "'Georgia', serif",
                    fontSize: '0.675rem',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    color: 'var(--accent)',
                    background: 'transparent',
                    border: '1px solid var(--accent)',
                    padding: '0.35rem 0.75rem',
                    cursor: 'pointer',
                    transition: 'background 0.15s, color 0.15s',
                  }}
                  onMouseEnter={e => {
                    const btn = e.currentTarget as HTMLButtonElement
                    btn.style.background = 'var(--accent)'
                    btn.style.color = 'var(--bg)'
                  }}
                  onMouseLeave={e => {
                    const btn = e.currentTarget as HTMLButtonElement
                    btn.style.background = 'transparent'
                    btn.style.color = 'var(--accent)'
                  }}
                >
                  Выйти
                </button>
              </div>
            ) : (
              <button
                onClick={() => setAuthModalOpen(true)}
                style={{
                  fontFamily: "'Playfair Display', 'Georgia', serif",
                  fontWeight: 600,
                  fontSize: '0.8125rem',
                  letterSpacing: '0.03em',
                  color: 'var(--bg)',
                  background: 'var(--accent)',
                  border: '2px solid var(--accent)',
                  padding: '0.45rem 1.1rem',
                  cursor: 'pointer',
                  transition: 'background 0.15s, border-color 0.15s',
                }}
                onMouseEnter={e => {
                  const btn = e.currentTarget as HTMLButtonElement
                  btn.style.background = 'var(--accent-hover)'
                  btn.style.borderColor = 'var(--accent-hover)'
                }}
                onMouseLeave={e => {
                  const btn = e.currentTarget as HTMLButtonElement
                  btn.style.background = 'var(--accent)'
                  btn.style.borderColor = 'var(--accent)'
                }}
              >
                Войти
              </button>
            )}
          </div>
        </div>
      </header>

      {/* ── Main content ── */}
      <main
        style={{
          maxWidth: '1280px',
          margin: '0 auto',
          padding: '2rem 1.5rem 4rem',
        }}
      >
        {/* ── Club description banner ── */}
        <div
          style={{
            marginBottom: '2rem',
            paddingBottom: '2rem',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          <p
            style={{
              fontFamily: "'Georgia', serif",
              fontSize: '0.875rem',
              lineHeight: 1.7,
              color: 'var(--text-secondary)',
              margin: 0,
              maxWidth: '680px',
            }}
          >
            Мы выбираем книги, которые хотели бы почитать вместе с другими людьми.
            В Telegram я создаю чат для координации вокруг определённой книги —
            и дальнейшая коммуникация происходит там. Сайт нужен только для выбора книг.
          </p>
        </div>

        {/* ── Search + Filters row ── */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            gap: '1rem',
            marginBottom: '2rem',
            paddingBottom: '1.5rem',
            borderBottom: '1px solid var(--border-subtle)',
          }}
        >
          {/* Search */}
          <div style={{ flex: '1 1 220px', minWidth: '180px' }}>
            <label
              htmlFor="book-search"
              style={{ ...labelStyle, display: 'block', marginBottom: '0.3rem' }}
            >
              Поиск
            </label>
            <input
              id="book-search"
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Название или автор…"
              style={inputStyle}
              onFocus={e => {
                const inp = e.currentTarget
                inp.style.background = 'var(--bg-input-focus)'
                inp.style.borderColor = 'var(--accent)'
              }}
              onBlur={e => {
                const inp = e.currentTarget
                inp.style.background = 'var(--bg-input)'
                inp.style.borderColor = 'var(--border)'
                inp.style.borderBottomColor = 'var(--accent)'
              }}
            />
          </div>

          {/* Tag filter */}
          <div>
            <label
              htmlFor="filter-tag"
              style={{ ...labelStyle, display: 'block', marginBottom: '0.3rem' }}
            >
              Тема
            </label>
            <div style={{ position: 'relative' }}>
              <select
                id="filter-tag"
                value={filterTag}
                onChange={e => setFilterTag(e.target.value)}
                style={selectStyle}
              >
                <option value="">Все темы</option>
                {allTags.map(tag => (
                  <option key={tag} value={tag}>{tag}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Author filter */}
          <div>
            <label
              htmlFor="filter-author"
              style={{ ...labelStyle, display: 'block', marginBottom: '0.3rem' }}
            >
              Автор
            </label>
            <div style={{ position: 'relative' }}>
              <select
                id="filter-author"
                value={filterAuthor}
                onChange={e => setFilterAuthor(e.target.value)}
                style={selectStyle}
              >
                <option value="">Все авторы</option>
                {allAuthors.map(author => (
                  <option key={author} value={author}>{author}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Results count */}
          <span
            style={{
              fontFamily: "'Georgia', serif",
              fontStyle: 'italic',
              fontSize: '0.8rem',
              color: 'var(--text-muted)',
              letterSpacing: '0.01em',
              paddingBottom: '0.45rem',
              whiteSpace: 'nowrap',
            }}
          >
            {filteredBooks.length}{' '}
            {filteredBooks.length === 1 ? 'книга' : 'книг'}
          </span>
        </div>

        {/* ── Books grid ── */}
        {filteredBooks.length > 0 ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))',
              gap: '1.5rem',
            }}
          >
            {filteredBooks.map(book => (
              <BookCard
                key={book.id}
                book={book}
                isSelected={selectedBooks.includes(book.name)}
                onToggle={handleToggle}
              />
            ))}
          </div>
        ) : (
          /* ── Empty state ── */
          <div
            style={{
              textAlign: 'center',
              padding: '5rem 2rem',
              borderTop: '1px solid var(--border-subtle)',
            }}
          >
            {/* Decorative ornament */}
            <div
              aria-hidden
              style={{
                fontFamily: "'Georgia', serif",
                fontSize: '2rem',
                color: 'var(--border)',
                marginBottom: '1rem',
                letterSpacing: '0.5em',
              }}
            >
              ✦ ✦ ✦
            </div>
            <p
              style={{
                fontFamily: "'Playfair Display', 'Georgia', serif",
                fontWeight: 700,
                fontSize: '1.25rem',
                color: 'var(--text)',
                margin: '0 0 0.5rem 0',
                letterSpacing: '-0.01em',
              }}
            >
              Ничего не найдено
            </p>
            <p
              style={{
                fontFamily: "'Georgia', serif",
                fontStyle: 'italic',
                fontSize: '0.875rem',
                color: 'var(--text-muted)',
                margin: 0,
              }}
            >
              Попробуйте изменить запрос или сбросить фильтры
            </p>
            {(query || filterTag || filterAuthor) && (
              <button
                onClick={() => { setQuery(''); setFilterTag(''); setFilterAuthor('') }}
                style={{
                  marginTop: '1.5rem',
                  fontFamily: "'Georgia', serif",
                  fontSize: '0.75rem',
                  letterSpacing: '0.08em',
                  textTransform: 'uppercase',
                  color: 'var(--accent)',
                  background: 'transparent',
                  border: '1px solid var(--accent)',
                  padding: '0.45rem 1rem',
                  cursor: 'pointer',
                  transition: 'background 0.15s, color 0.15s',
                }}
                onMouseEnter={e => {
                  const btn = e.currentTarget as HTMLButtonElement
                  btn.style.background = 'var(--accent)'
                  btn.style.color = 'var(--bg)'
                }}
                onMouseLeave={e => {
                  const btn = e.currentTarget as HTMLButtonElement
                  btn.style.background = 'transparent'
                  btn.style.color = 'var(--accent)'
                }}
              >
                Сбросить фильтры
              </button>
            )}
          </div>
        )}
      </main>

      {/* ── Auth modal ── */}
      <AuthModal
        isOpen={authModalOpen}
        onClose={() => { setAuthModalOpen(false); setPendingBook(null) }}
      />

      {/* ── Contacts popup ── */}
      {showContactsForm && (
        <div
          onClick={e => { if (e.target === e.currentTarget) { setShowContactsForm(false); setPendingBook(null) } }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(26, 23, 20, 0.72)',
            zIndex: 9999,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div style={{ position: 'relative', width: '100%', maxWidth: '480px' }}>
            {/* Close button */}
            <button
              onClick={() => { setShowContactsForm(false); setPendingBook(null) }}
              aria-label="Закрыть"
              style={{
                position: 'absolute',
                top: '1rem',
                right: '1rem',
                zIndex: 1,
                background: 'transparent',
                border: 'none',
                cursor: 'pointer',
                fontFamily: "'Georgia', serif",
                fontSize: '1.125rem',
                color: 'var(--text-muted)',
                lineHeight: 1,
                padding: '0.2rem 0.4rem',
              }}
            >
              ✕
            </button>
            <ContactsForm
              initialName={effectiveUser?.name ?? session?.user?.name ?? ''}
              initialContacts={effectiveUser?.contacts ?? ''}
              onSave={handleContactsSave}
            />
          </div>
        </div>
      )}
    </div>
  )
}
