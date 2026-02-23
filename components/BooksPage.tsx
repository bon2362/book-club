'use client'

import { useState, useMemo, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import type { Book } from '@/lib/sheets'
import type { UserSignup } from '@/lib/signups'
import { searchBooks } from '@/lib/search'
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
    color: '#8C7B6B',
  }

  const selectStyle: React.CSSProperties = {
    fontFamily: "'Georgia', serif",
    fontSize: '0.8125rem',
    color: '#1A1714',
    background: '#F9F5EE',
    border: '1px solid #D4C4B0',
    borderBottom: '2px solid #B5451B',
    padding: '0.45rem 2rem 0.45rem 0.65rem',
    outline: 'none',
    cursor: 'pointer',
    appearance: 'none' as const,
    WebkitAppearance: 'none' as const,
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='%238C7B6B'/%3E%3C/svg%3E")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 0.5rem center',
    backgroundSize: '8px',
    minWidth: '140px',
  }

  const inputStyle: React.CSSProperties = {
    fontFamily: "'Georgia', serif",
    fontSize: '0.875rem',
    color: '#1A1714',
    background: '#FDFAF5',
    border: '1px solid #D4C4B0',
    borderBottom: '2px solid #B5451B',
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
        background: '#F9F5EE',
        fontFamily: "'Playfair Display', 'Georgia', 'Times New Roman', serif",
      }}
    >
      {/* ── Header ── */}
      <header
        style={{
          borderBottom: '2px solid #1A1714',
          background: '#F9F5EE',
          position: 'sticky',
          top: 0,
          zIndex: 100,
          boxShadow: '0 2px 8px rgba(26,23,20,0.08)',
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
          {/* Title */}
          <span
            style={{
              fontFamily: "'Playfair Display', 'Georgia', serif",
              fontWeight: 700,
              fontSize: '1.375rem',
              letterSpacing: '-0.02em',
              color: '#1A1714',
              lineHeight: 1,
            }}
          >
            Долгое наступление
          </span>

          {/* Auth button */}
          {isLoggedIn ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <span
                style={{
                  fontFamily: "'Georgia', serif",
                  fontStyle: 'italic',
                  fontSize: '0.8125rem',
                  color: '#5C4A3A',
                  letterSpacing: '0.01em',
                  maxWidth: '180px',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {session.user?.name ?? session.user?.email}
              </span>
              <button
                onClick={() => signOut()}
                style={{
                  fontFamily: "'Georgia', serif",
                  fontSize: '0.675rem',
                  letterSpacing: '0.1em',
                  textTransform: 'uppercase',
                  color: '#B5451B',
                  background: 'transparent',
                  border: '1px solid #B5451B',
                  padding: '0.35rem 0.75rem',
                  cursor: 'pointer',
                  transition: 'background 0.15s, color 0.15s',
                }}
                onMouseEnter={e => {
                  const btn = e.currentTarget as HTMLButtonElement
                  btn.style.background = '#B5451B'
                  btn.style.color = '#F9F5EE'
                }}
                onMouseLeave={e => {
                  const btn = e.currentTarget as HTMLButtonElement
                  btn.style.background = 'transparent'
                  btn.style.color = '#B5451B'
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
                color: '#F9F5EE',
                background: '#B5451B',
                border: '2px solid #B5451B',
                padding: '0.45rem 1.1rem',
                cursor: 'pointer',
                transition: 'background 0.15s, color 0.15s',
              }}
              onMouseEnter={e => {
                const btn = e.currentTarget as HTMLButtonElement
                btn.style.background = '#8C3415'
                btn.style.borderColor = '#8C3415'
              }}
              onMouseLeave={e => {
                const btn = e.currentTarget as HTMLButtonElement
                btn.style.background = '#B5451B'
                btn.style.borderColor = '#B5451B'
              }}
            >
              Войти
            </button>
          )}
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
        {/* Contacts form banner (logged in but no profile yet) */}
        {showContactsForm && (
          <div
            style={{
              marginBottom: '2.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            <ContactsForm
              initialName={session?.user?.name ?? ''}
              onSave={handleContactsSave}
            />
          </div>
        )}

        {/* ── Search + Filters row ── */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'flex-end',
            gap: '1rem',
            marginBottom: '2rem',
            paddingBottom: '1.5rem',
            borderBottom: '1px solid #E2D8CC',
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
                inp.style.background = '#FFFFFF'
                inp.style.borderColor = '#B5451B'
              }}
              onBlur={e => {
                const inp = e.currentTarget
                inp.style.background = '#FDFAF5'
                inp.style.borderColor = '#D4C4B0'
                inp.style.borderBottomColor = '#B5451B'
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
              color: '#8C7B6B',
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
              borderTop: '1px solid #E2D8CC',
            }}
          >
            {/* Decorative ornament */}
            <div
              aria-hidden
              style={{
                fontFamily: "'Georgia', serif",
                fontSize: '2rem',
                color: '#D4C4B0',
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
                color: '#1A1714',
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
                color: '#8C7B6B',
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
                  color: '#B5451B',
                  background: 'transparent',
                  border: '1px solid #B5451B',
                  padding: '0.45rem 1rem',
                  cursor: 'pointer',
                  transition: 'background 0.15s, color 0.15s',
                }}
                onMouseEnter={e => {
                  const btn = e.currentTarget as HTMLButtonElement
                  btn.style.background = '#B5451B'
                  btn.style.color = '#F9F5EE'
                }}
                onMouseLeave={e => {
                  const btn = e.currentTarget as HTMLButtonElement
                  btn.style.background = 'transparent'
                  btn.style.color = '#B5451B'
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
    </div>
  )
}
