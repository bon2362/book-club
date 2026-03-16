'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import { useSession, signOut } from 'next-auth/react'
import type { BookWithCover } from '@/lib/books-with-covers'
import type { UserSignup } from '@/lib/signups'
import { searchBooks } from '@/lib/search'
import Header from './Header'
import BookCard from './BookCard'
import BookRow from './BookRow'
import AuthModal from './AuthModal'
import ContactsForm from './ContactsForm'
import SubmitBookForm from './SubmitBookForm'
import SubmitBookCard from './SubmitBookCard'
import AboutBlock, { type AboutBlockHandle } from './AboutBlock'

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

  const [aboutVisible, setAboutVisible] = useState(true)
  const aboutRef = useRef<AboutBlockHandle>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
  const [showScrollTop, setShowScrollTop] = useState(false)
  const lastScrollY = useRef(0)

  useEffect(() => {
    if (localStorage.getItem('aboutDismissed') === 'true') setAboutVisible(false)
    const saved = localStorage.getItem('book_view_mode')
    if (saved === 'grid' || saved === 'list') setViewMode(saved)
    if (localStorage.getItem('show_read') === 'true') setShowRead(true)
  }, [])

  useEffect(() => {
    function handleScroll() {
      const y = window.scrollY
      const scrollingUp = y < lastScrollY.current
      const farEnough = y > window.innerHeight * 2
      setShowScrollTop(scrollingUp && farEnough)
      lastScrollY.current = y
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

  function handleCloseAbout() {
    localStorage.setItem('aboutDismissed', 'true')
    setAboutVisible(false)
  }

  function handleWhatIsThis() {
    if (aboutVisible) {
      // Block already visible — just scroll to it, don't re-open accordion
      aboutRef.current?.scrollIntoView()
      return
    }
    localStorage.removeItem('aboutDismissed')
    // flushSync ensures React commits the render before we call imperative methods
    flushSync(() => { setAboutVisible(true) })
    aboutRef.current?.openAccordion()
    aboutRef.current?.scrollIntoView()
  }

  function handleSetViewMode(mode: 'grid' | 'list') {
    setViewMode(mode)
    localStorage.setItem('book_view_mode', mode)
  }

  const [query, setQuery] = useState('')
  const [filterTag, setFilterTag] = useState('')
  const [filterAuthor, setFilterAuthor] = useState('')
  const [showRead, setShowRead] = useState(false)
  const [showMyBooks, setShowMyBooks] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [selectedBooks, setSelectedBooks] = useState<string[]>(
    currentUser?.selectedBooks ?? []
  )
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [showContactsForm, setShowContactsForm] = useState(false)
  const [submitFormOpen, setSubmitFormOpen] = useState(false)
  const [submitIntent, setSubmitIntent] = useState(false)

  useEffect(() => {
    const stored = localStorage.getItem('submitIntent') === '1'
    if (stored) {
      localStorage.removeItem('submitIntent')
      setSubmitIntent(true)
    }
  }, [])

  useEffect(() => {
    if (isLoggedIn && submitIntent) {
      setSubmitFormOpen(true)
      setSubmitIntent(false)
    }
  }, [isLoggedIn, submitIntent])

  function handleSubmitBookClick() {
    if (isLoggedIn) {
      setSubmitFormOpen(true)
    } else {
      localStorage.setItem('submitIntent', '1')
      setSubmitIntent(true)
      setAuthModalOpen(true)
    }
  }
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
    books.forEach(b => {
      if (!b.author) return
      b.author.split(/,|( и )|&/).forEach(part => {
        const name = part?.trim()
        if (name) s.add(name)
      })
    })
    return Array.from(s).sort()
  }, [books])

  const filteredBooks = useMemo(() => {
    let result = searchBooks(books, query)
    if (filterTag) result = result.filter(b => b.tags.includes(filterTag))
    if (filterAuthor) result = result.filter(b => b.author.split(/,|( и )|&/).map(p => p?.trim()).includes(filterAuthor))
    result = result.filter(b => showRead ? b.status === 'read' : b.status !== 'read')
    if (showMyBooks) result = result.filter(b => selectedBooks.includes(b.name))
    if (showNew) result = result.filter(b => b.isNew)
    return result
  }, [books, query, filterTag, filterAuthor, showRead, showMyBooks, showNew, selectedBooks])

  const hasReadBooks = useMemo(() => books.some(b => b.status === 'read'), [books])
  const hasNewBooks = useMemo(() => books.some(b => b.isNew), [books])

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

  function chipStyle(active: boolean): React.CSSProperties {
    return {
      fontFamily: 'var(--nd-sans), system-ui, sans-serif',
      fontSize: '0.75rem',
      color: active ? '#fff' : '#111',
      background: active ? '#111' : 'transparent',
      border: '1px solid #111',
      padding: '0.4rem 0.65rem',
      cursor: 'pointer',
      transition: 'background 0.15s, color 0.15s',
      whiteSpace: 'nowrap' as const,
    }
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
        onSubmitBook={handleSubmitBookClick}
        onWhatIsThis={handleWhatIsThis}
      />

      {/* About */}
      {aboutVisible && (
        <AboutBlock ref={aboutRef} onClose={handleCloseAbout} />
      )}

      {/* Search + filters */}
      <div style={{ borderBottom: '1px solid #E5E5E5', background: '#fff' }}>
        <div
          className="filters-bar"
          style={{
            maxWidth: '1200px',
            margin: '0 auto',
            padding: '0.6rem 1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.5rem',
          }}
        >
          {/* Row 1: поиск + переключатель вида */}
          <div className="filters-row1" style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            <input
              className="filters-search"
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Поиск по названию или автору…"
              style={{
                flex: 1,
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
            <button
              className="filters-view-toggle"
              onClick={() => handleSetViewMode(viewMode === 'grid' ? 'list' : 'grid')}
              title={viewMode === 'grid' ? 'Переключить в таблицу' : 'Переключить в сетку'}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.3rem', color: '#111', display: 'flex', flexShrink: 0 }}
            >
              {viewMode === 'grid' ? (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="1" y="2" width="14" height="2" rx="0.5" />
                  <rect x="1" y="7" width="14" height="2" rx="0.5" />
                  <rect x="1" y="12" width="14" height="2" rx="0.5" />
                </svg>
              ) : (
                <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                  <rect x="1" y="1" width="6" height="6" rx="0.5" />
                  <rect x="9" y="1" width="6" height="6" rx="0.5" />
                  <rect x="1" y="9" width="6" height="6" rx="0.5" />
                  <rect x="9" y="9" width="6" height="6" rx="0.5" />
                </svg>
              )}
            </button>
          </div>

          {/* Row 2: два селекта + чипсы (на мобиле чипсы переносятся вниз) */}
          <div className="filters-row2" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', alignItems: 'center' }}>
            <select className="filters-select-tag" value={filterTag} onChange={e => setFilterTag(e.target.value)} style={{ ...selectStyle, flex: 1, minWidth: '130px' }}>
              <option value="">Тема: все</option>
              {allTags.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
            <select className="filters-select-author" value={filterAuthor} onChange={e => setFilterAuthor(e.target.value)} style={{ ...selectStyle, flex: 1, minWidth: '130px' }}>
              <option value="">Автор: все</option>
              {allAuthors.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
            {(hasNewBooks || (isLoggedIn && selectedBooks.length > 0) || hasReadBooks) && (
              <>
                {hasNewBooks && (
                  <button onClick={() => setShowNew(v => !v)} style={chipStyle(showNew)}>
                    {showNew ? '✓ Новинки' : 'Новинки'}
                  </button>
                )}
                {isLoggedIn && selectedBooks.length > 0 && (
                  <div style={{ position: 'relative', display: 'inline-block' }} className="tooltip-wrap">
                    <button onClick={() => setShowMyBooks(v => !v)} style={chipStyle(showMyBooks)}>
                      {showMyBooks ? '✓ Записался' : 'Записался'}
                    </button>
                    <span className="tooltip-text" style={{
                      position: 'absolute',
                      bottom: 'calc(100% + 6px)',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: '#222',
                      color: '#fff',
                      fontSize: '0.75rem',
                      padding: '4px 10px',
                      borderRadius: '6px',
                      whiteSpace: 'nowrap',
                      pointerEvents: 'none',
                      opacity: 0,
                      transition: 'opacity 0.15s',
                    }}>
                      Книги, на которые вы записались
                    </span>
                  </div>
                )}
                {hasReadBooks && (
                  <button
                    onClick={() => setShowRead(v => { const next = !v; localStorage.setItem('show_read', String(next)); return next })}
                    style={chipStyle(showRead)}
                  >
                    {showRead ? '✓ Прочитанные' : 'Прочитанные'}
                  </button>
                )}
              </>
            )}
          </div>
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

      {/* Books */}
      <main style={{ maxWidth: '1200px', margin: '0 auto', padding: '1.5rem' }}>
        {filteredBooks.length === 0 ? (
          <p style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.875rem', color: '#999', textAlign: 'center', padding: '3rem 0' }}>
            Ничего не найдено
          </p>
        ) : viewMode === 'grid' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1.5rem' }}>
            <SubmitBookCard onClick={handleSubmitBookClick} />
            {filteredBooks.map(book => (
              <BookCard key={book.id} book={book} isSelected={selectedBooks.includes(book.name)} onToggle={handleToggle} />
            ))}
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', borderTop: '2px solid #111' }}>
            <tbody>
              <tr style={{ borderBottom: '2px solid #111', background: '#FAFAF8' }}>
                <td colSpan={6} style={{ padding: '0.75rem 0.75rem' }}>
                  <button
                    onClick={handleSubmitBookClick}
                    style={{
                      background: '#111',
                      border: 'none',
                      borderRadius: '2px',
                      padding: '0.4rem 0.85rem',
                      fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                      fontSize: '0.75rem',
                      color: '#fff',
                      cursor: 'pointer',
                      letterSpacing: '0.04em',
                    }}
                  >
                    + Предложить книгу
                  </button>
                </td>
              </tr>
              {filteredBooks.map(book => (
                <BookRow key={book.id} book={book} isSelected={selectedBooks.includes(book.name)} onToggle={handleToggle} />
              ))}
            </tbody>
          </table>
        )}
      </main>

      {showScrollTop && (
        <button
          onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
          aria-label="Наверх"
          style={{
            display: 'none',
            position: 'fixed',
            bottom: '1.5rem',
            right: '1.5rem',
            width: '2.75rem',
            height: '2.75rem',
            borderRadius: '50%',
            background: '#111',
            color: '#fff',
            border: 'none',
            fontSize: '1.25rem',
            cursor: 'pointer',
            boxShadow: '0 2px 12px rgba(0,0,0,0.18)',
            zIndex: 999,
          }}
          // показываем только на мобильных через className
          className="scroll-top-btn"
        >
          ↑
        </button>
      )}
      <style>{`
        @media (max-width: 768px) {
          .scroll-top-btn { display: flex !important; align-items: center; justify-content: center; }
        }

        @media (min-width: 769px) {
          /* Десктоп: селекты компактные, чипсы inline на той же строке */
          .filters-row2 { flex-wrap: nowrap; }
          .filters-select-tag,
          .filters-select-author { flex: 0 0 auto; width: 180px; }
        }
      `}</style>

      {authModalOpen && (
        <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />
      )}
      {submitFormOpen && (
        <SubmitBookForm
          isOpen={submitFormOpen}
          onClose={() => setSubmitFormOpen(false)}
          topics={allTags}
          initialTopic={filterTag || undefined}
          initialAuthor={filterAuthor || undefined}
        />
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
