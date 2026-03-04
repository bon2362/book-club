'use client'

import { useState, useMemo, useEffect } from 'react'
import { useSession, signOut } from 'next-auth/react'
import type { BookWithCover } from '@/lib/books-with-covers'
import type { UserSignup } from '@/lib/signups'
import { searchBooks } from '@/lib/search'
import Header from './Header'
import BookCard from './BookCard'
import AuthModal from './AuthModal'
import ContactsForm from './ContactsForm'

interface Props {
  books: BookWithCover[]
  currentUser: UserSignup | null
  tagDescriptions: Record<string, string>
}

async function saveSelection(name: string, contacts: string, books: string[]) {
  const res = await fetch('/api/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, contacts, selectedBooks: books }),
  })
  if (!res.ok) throw new Error(`Signup failed: ${res.status}`)
}

export default function BooksPage({ books, currentUser, tagDescriptions }: Props) {
  const { data: session } = useSession()
  const isLoggedIn = !!session?.user?.email
  const isAdmin = !!session?.user?.isAdmin
  const telegramUsername = session?.user?.telegramUsername ?? null

  const [showAbout, setShowAbout] = useState(true)

  useEffect(() => {
    if (document.cookie.split(';').some(c => c.trim() === 'about_closed=1')) {
      setShowAbout(false)
    }
  }, [])

  function handleCloseAbout() {
    document.cookie = 'about_closed=1; max-age=31536000; path=/'
    setShowAbout(false)
  }

  const [query, setQuery] = useState('')
  const [filterTag, setFilterTag] = useState('')
  const [filterAuthor, setFilterAuthor] = useState('')
  const [showRead, setShowRead] = useState(false)
  const [selectedBooks, setSelectedBooks] = useState<string[]>(
    currentUser?.selectedBooks ?? []
  )
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [showContactsForm, setShowContactsForm] = useState(false)
  const [pendingBook, setPendingBook] = useState<BookWithCover | null>(null)
  const [savedUser, setSavedUser] = useState<{ name: string; contacts: string } | null>(null)
  const effectiveUser = currentUser ?? savedUser

  useEffect(() => {
    if (isLoggedIn && !currentUser && !savedUser && !isAdmin) setShowContactsForm(true)
  }, [isLoggedIn, currentUser, savedUser, isAdmin])

  const allTags = useMemo(() => {
    const s = new Set<string>()
    books.forEach(b => b.tags.forEach(t => s.add(t)))
    return Array.from(s).sort()
  }, [books])

  const allAuthors = useMemo(() => {
    const s = new Set<string>()
    books.forEach(b => { if (b.author) s.add(b.author) })
    return Array.from(s).sort()
  }, [books])

  const filteredBooks = useMemo(() => {
    let result = searchBooks(books, query) as BookWithCover[]
    if (filterTag) result = result.filter(b => b.tags.includes(filterTag))
    if (filterAuthor) result = result.filter(b => b.author === filterAuthor)
    if (!showRead) result = result.filter(b => b.status !== 'read')
    return result
  }, [books, query, filterTag, filterAuthor, showRead])

  const hasReadBooks = useMemo(() => books.some(b => b.status === 'read'), [books])

  function handleToggle(book: BookWithCover) {
    if (!isLoggedIn) {
      setPendingBook(book)
      setAuthModalOpen(true)
      return
    }
    if (!effectiveUser) {
      setPendingBook(book)
      setShowContactsForm(true)
      return
    }

    const next = selectedBooks.includes(book.name)
      ? selectedBooks.filter(n => n !== book.name)
      : [...selectedBooks, book.name]

    setSelectedBooks(next)
    saveSelection(effectiveUser.name, effectiveUser.contacts, next).catch(console.error)
  }

  async function handleSaveContacts(name: string, contacts: string) {
    const booksList = pendingBook
      ? [...selectedBooks, pendingBook.name]
      : selectedBooks
    await saveSelection(name, contacts, booksList)
    setSavedUser({ name, contacts })
    if (pendingBook) {
      setSelectedBooks(booksList)
      setPendingBook(null)
    }
  }

  async function handleDeleteAccount() {
    await fetch('/api/user', { method: 'DELETE' })
    await signOut()
  }

  const selectStyle: React.CSSProperties = {
    fontFamily: 'var(--nd-sans), system-ui, sans-serif',
    fontSize: '0.75rem',
    color: '#111',
    background: '#fff',
    border: '1px solid #E5E5E5',
    borderBottom: '2px solid #111',
    padding: '0.4rem 0.6rem',
    cursor: 'pointer',
    outline: 'none',
  }

  return (
    <>
      <Header
        onEditProfile={isLoggedIn ? () => setShowContactsForm(true) : undefined}
        onSignIn={!isLoggedIn ? () => setAuthModalOpen(true) : undefined}
      />

      {/* About */}
      {showAbout && (
        <div style={{ borderBottom: '1px solid #E5E5E5' }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <p style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.875rem', lineHeight: 1.65, color: '#555', margin: 0, flex: 1 }}>
              Я, Евгений, приглашаю вместе читать и обсуждать книги. Если вам что-то приглянулось из списка, записывайтесь — я свяжусь через Telegram, и согласуем формат.
            </p>
            <button
              onClick={handleCloseAbout}
              title="Скрыть"
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#bbb', fontSize: '1.1rem', lineHeight: 1, padding: '0.25rem', flexShrink: 0 }}
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Search + filters */}
      <div style={{ borderBottom: '1px solid #E5E5E5', background: '#fff' }}>
        <div
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            padding: '0.75rem 1.5rem',
            display: 'flex',
            gap: '0.75rem',
            flexWrap: 'wrap',
            alignItems: 'center',
          }}
        >
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Поиск по названию или автору…"
            style={{
              flex: '1 1 220px',
              fontFamily: 'var(--nd-sans), system-ui, sans-serif',
              fontSize: '0.8rem',
              color: '#111',
              background: '#fff',
              border: '1px solid #E5E5E5',
              borderBottom: '2px solid #111',
              padding: '0.4rem 0.6rem',
              outline: 'none',
            }}
          />
          <select value={filterTag} onChange={e => setFilterTag(e.target.value)} style={selectStyle}>
            <option value="">Тема: все</option>
            {allTags.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select value={filterAuthor} onChange={e => setFilterAuthor(e.target.value)} style={selectStyle}>
            <option value="">Автор: все</option>
            {allAuthors.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          {hasReadBooks && (
            <button
              onClick={() => setShowRead(v => !v)}
              style={{
                fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                fontSize: '0.75rem',
                color: showRead ? '#fff' : '#111',
                background: showRead ? '#111' : 'transparent',
                border: '1px solid #111',
                padding: '0.4rem 0.75rem',
                cursor: 'pointer',
                transition: 'background 0.15s, color 0.15s',
              }}
            >
              {showRead ? '✓ Прочитанные' : 'Показать прочитанные'}
            </button>
          )}
        </div>
      </div>

      {/* Tag description */}
      {filterTag && tagDescriptions[filterTag] && (
        <div style={{ borderBottom: '1px solid #E5E5E5' }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1rem 1.5rem' }}>
            <p
              style={{
                fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                fontSize: '0.8rem',
                lineHeight: 1.65,
                color: '#555',
                margin: 0,
                borderLeft: '2px solid #111',
                paddingLeft: '1rem',
              }}
            >
              {tagDescriptions[filterTag]}
            </p>
          </div>
        </div>
      )}

      {/* Grid */}
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem' }}>
        {filteredBooks.length === 0 ? (
          <p style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.875rem', color: '#999', textAlign: 'center', padding: '3rem 0' }}>
            Ничего не найдено
          </p>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
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
        )}
      </main>

      {authModalOpen && (
        <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />
      )}
      {showContactsForm && (
        <ContactsForm
          defaultName={effectiveUser?.name}
          defaultContacts={effectiveUser?.contacts ?? (telegramUsername ? '@' + telegramUsername : undefined)}
          telegramLocked={!!telegramUsername}
          onSave={handleSaveContacts}
          onClose={() => { setShowContactsForm(false); setPendingBook(null) }}
          onDelete={isLoggedIn ? handleDeleteAccount : undefined}
        />
      )}
    </>
  )
}
