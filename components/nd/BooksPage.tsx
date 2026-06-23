'use client'

import { useState, useMemo, useEffect, useRef } from 'react'
import { flushSync } from 'react-dom'
import { useSession, signOut } from 'next-auth/react'
import type { BookWithCover } from '@/lib/books-with-covers'
import type { UserSignup, PersonalBookStatus } from '@/lib/signup-books'
import { searchBooks } from '@/lib/search'
import { bookMatchesAuthor, getUniqueAuthors } from '@/lib/authors'
import Header from './Header'
import BookCard from './BookCard'
import BookRow from './BookRow'
import BookCardMobile from './BookCardMobile'
import AuthModal from './AuthModal'
import { track } from '@/lib/analytics'
import ContactsForm from './ContactsForm'
import ProfileDrawer from './ProfileDrawer'
import SubmitBookForm from './SubmitBookForm'
import SubmitBookCard from './SubmitBookCard'
import AboutBlock, { type AboutBlockHandle, type AboutBlockHeader, type AboutBlockSection } from './AboutBlock'
import Footer from './Footer'
import FeedbackForm from './FeedbackForm'
import { useScrollHide } from '@/lib/scroll-hide-context'
import { getUserContactEmail } from '@/lib/user-email'
import { useAutoDismiss } from './useAutoDismiss'
import { normalizeRememberedAuthProvider, writeRememberedAuthProvider } from './auth-provider-memory'

interface Props {
  books: BookWithCover[]
  currentUser: UserSignup | null
  tagDescriptions: Record<string, string>
  introHeader: AboutBlockHeader
  introSections: AboutBlockSection[]
  initialAboutVisible: boolean
  initialViewMode: 'grid' | 'list'
  initialShowRead: boolean
}

// Пишем UI-настройку в cookie (не localStorage), чтобы сервер видел её до
// отрисовки и первый кадр сразу был правильным — иначе вёрстка дёргается (CLS).
function setPrefCookie(name: string, value: string) {
  document.cookie = `${name}=${value}; path=/; max-age=31536000; samesite=lax`
}

async function saveSelection(name: string, contacts: string, bookIds: string[]) {
  const res = await fetch('/api/signup', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, contacts, selectedBookIds: bookIds }),
  })
  if (!res.ok) throw new Error(`Signup failed: ${res.status}`)
}

async function saveProfile(name: string, contacts: string) {
  const res = await fetch('/api/profile', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, contacts }),
  })
  if (!res.ok) throw new Error(`Profile save failed: ${res.status}`)
}

export default function BooksPage({ books, currentUser, tagDescriptions, introHeader, introSections, initialAboutVisible, initialViewMode, initialShowRead }: Props) {
  const { data: session } = useSession()
  const { isHidden } = useScrollHide()
  const isLoggedIn = !!session?.user?.id
  const isAdmin = !!session?.user?.isAdmin
  const contactEmail = getUserContactEmail(session?.user)

  const [aboutVisible, setAboutVisible] = useState(initialAboutVisible)
  const aboutRef = useRef<AboutBlockHandle>(null)
  const [viewMode, setViewMode] = useState<'grid' | 'list'>(initialViewMode)
  const [showScrollTop, setShowScrollTop] = useState(false)
  const lastScrollY = useRef(0)

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
    setPrefCookie('about_dismissed', 'true')
    setAboutVisible(false)
  }

  function handleWhatIsThis() {
    if (aboutVisible) {
      // Block already visible — just scroll to it, don't re-open accordion
      aboutRef.current?.scrollIntoView()
      return
    }
    setPrefCookie('about_dismissed', 'false')
    // flushSync ensures React commits the render before we call imperative methods
    flushSync(() => { setAboutVisible(true) })
    aboutRef.current?.openAccordion()
    aboutRef.current?.scrollIntoView()
  }

  function handleSetViewMode(mode: 'grid' | 'list') {
    setViewMode(mode)
    setPrefCookie('book_view_mode', mode)
  }

  const [query, setQuery] = useState('')
  const [filterTag, setFilterTag] = useState('')
  const [filterAuthor, setFilterAuthor] = useState('')
  const [showRead, setShowRead] = useState(initialShowRead)
  const [showMyBooks, setShowMyBooks] = useState(false)
  const [showNew, setShowNew] = useState(false)
  const [selectedBooks, setSelectedBooks] = useState<string[]>(
    currentUser?.selectedBookIds ?? books.filter(book => currentUser?.selectedBooks.includes(book.name)).map(book => book.id)
  )
  const selectedBooksRef = useRef(selectedBooks)
  const saveSelectionQueueRef = useRef<Promise<void>>(Promise.resolve())
  const [authModalOpen, setAuthModalOpen] = useState(false)
  const [showContactsForm, setShowContactsForm] = useState(false)
  const [profileDrawerOpen, setProfileDrawerOpen] = useState(false)
  const [showPriorityHint, setShowPriorityHint] = useState(false)
  const [priorityHintPaused, setPriorityHintPaused] = useState(false)
  const [submitFormOpen, setSubmitFormOpen] = useState(false)
  const [submitIntent, setSubmitIntent] = useState(false)
  const [feedbackFormOpen, setFeedbackFormOpen] = useState(false)

  function enqueueSaveSelection(name: string, contacts: string, booksList: string[]): Promise<void> {
    const nextSave = saveSelectionQueueRef.current
      .catch(() => undefined)
      .then(() => saveSelection(name, contacts, booksList))
    saveSelectionQueueRef.current = nextSave
    return nextSave
  }

  // Авто-закрытие тоста-подсказки через 20s (пауза на hover). Логика таймера
  // вынесена в useAutoDismiss и покрыта unit-тестом с fake timers вместо
  // медленных Playwright-сценариев (см. components/nd/useAutoDismiss.test.tsx).
  useAutoDismiss(showPriorityHint, priorityHintPaused, () => setShowPriorityHint(false))

  useEffect(() => {
    selectedBooksRef.current = selectedBooks
  }, [selectedBooks])

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
      track('auth_modal_opened', { trigger: 'submit_book' })
      setAuthModalOpen(true)
    }
  }
  const [pendingBook, setPendingBook] = useState<BookWithCover | null>(null)
  const [savedUser, setSavedUser] = useState<{ name: string; contacts: string } | null>(null)
  const effectiveUser = currentUser ?? savedUser

  useEffect(() => {
    if (isLoggedIn && !currentUser && !savedUser && !isAdmin) {
      setShowContactsForm(true)
    }
  }, [isLoggedIn, currentUser, savedUser, isAdmin])

  useEffect(() => {
    if (!isLoggedIn) return

    const rememberedProvider = normalizeRememberedAuthProvider(session?.user?.provider)
    if (rememberedProvider) {
      writeRememberedAuthProvider(rememberedProvider)
    }
  }, [isLoggedIn, session?.user?.provider])

  const allTags = useMemo(() => {
    const s = new Set<string>()
    books.forEach(b => b.tags.forEach(t => s.add(t)))
    return Array.from(s).sort()
  }, [books])

  const allAuthors = useMemo(() => {
    return getUniqueAuthors(books)
  }, [books])

  const filteredBooks = useMemo(() => {
    let result = searchBooks(books, query)
    if (filterTag) result = result.filter(b => b.tags.includes(filterTag))
    if (filterAuthor) result = result.filter(b => bookMatchesAuthor(b, filterAuthor))
    result = result.filter(b => showRead ? b.status === 'read' : b.status !== 'read')
    if (showMyBooks) result = result.filter(b => selectedBooks.includes(b.id))
    if (showNew) result = result.filter(b => b.isNew)
    return result
  }, [books, query, filterTag, filterAuthor, showRead, showMyBooks, showNew, selectedBooks])

  const hasReadBooks = useMemo(() => books.some(b => b.status === 'read'), [books])
  const hasNewBooks = useMemo(() => books.some(b => b.isNew), [books])

  // Per-book personal reading status from SSR (reflects state at page load).
  // reading/read → catalog shows a soft label instead of the signup toggle.
  const personalStatusMap = useMemo(() => {
    const map = new Map<string, PersonalBookStatus>()
    for (const s of (currentUser?.signups ?? [])) {
      if (s.personalStatus) map.set(s.bookId, s.personalStatus)
    }
    return map
  }, [currentUser?.signups])

  function handleToggle(book: BookWithCover) {
    if (!isLoggedIn) {
      setPendingBook(book)
      track('auth_modal_opened', { trigger: 'book_signup' })
      setAuthModalOpen(true)
      return
    }
    if (!effectiveUser) {
      setPendingBook(book)
      setShowContactsForm(true)
      return
    }

    const currentSelection = selectedBooksRef.current
    const isAdding = !currentSelection.includes(book.id)
    const next = isAdding
      ? [...currentSelection, book.id]
      : currentSelection.filter(id => id !== book.id)

    track(isAdding ? 'book_signup' : 'book_unsignup', { bookName: book.name })
    selectedBooksRef.current = next
    setSelectedBooks(next)

    if (isAdding && next.length === 2 && !localStorage.getItem('hint_priorities_seen')) {
      localStorage.setItem('hint_priorities_seen', '1')
      setShowPriorityHint(true)
    }

    enqueueSaveSelection(effectiveUser.name, effectiveUser.contacts, next).catch(console.error)
  }

  async function handleSaveContacts(name: string, contacts: string) {
    if (currentUser && !pendingBook) {
      await saveProfile(name, contacts)
      setSavedUser({ name, contacts })
      return
    }

    const booksList = pendingBook
      ? [...selectedBooksRef.current, pendingBook.id]
      : selectedBooksRef.current
    await enqueueSaveSelection(name, contacts, booksList)
    setSavedUser({ name, contacts })
    if (pendingBook) {
      selectedBooksRef.current = booksList
      setSelectedBooks(booksList)
      setPendingBook(null)
    }
  }

  async function handleDeleteAccount() {
    await fetch('/api/user', { method: 'DELETE' })
    await signOut()
  }

  async function handleToggleById(bookId: string): Promise<void> {
    const original = selectedBooksRef.current
    const book = books.find(b => b.id === bookId)
    const isAdding = !original.includes(bookId)
    const next = isAdding
      ? [...original, bookId]
      : original.filter(id => id !== bookId)
    track(isAdding ? 'book_signup' : 'book_unsignup', { bookId, bookName: book?.name })
    selectedBooksRef.current = next
    setSelectedBooks(next)
    try {
      await enqueueSaveSelection(effectiveUser!.name, effectiveUser!.contacts, next)
    } catch (err) {
      selectedBooksRef.current = original
      setSelectedBooks(original) // rollback to snapshot taken before optimistic update
      throw err
    }
  }

  function chipStyle(active: boolean): React.CSSProperties {
    return {
      fontFamily: 'var(--nd-sans), system-ui, sans-serif',
      fontSize: '0.75rem',
      color: active ? '#fff' : '#111',
      background: active ? '#111' : 'transparent',
      border: '1px solid var(--border-strong)',
      padding: '0.4rem 0.65rem',
      cursor: 'pointer',
      transition: 'background 0.15s, color 0.15s',
      whiteSpace: 'nowrap' as const,
    }
  }

  const selectStyle: React.CSSProperties = {
    fontFamily: 'var(--nd-sans), system-ui, sans-serif',
    fontSize: '0.75rem',
    color: 'var(--text)',
    background: 'var(--bg-input)',
    border: '1px solid var(--border)',
    borderBottom: '2px solid var(--border-strong)',
    padding: '0.4rem 0.6rem',
    cursor: 'pointer',
    outline: 'none',
  }

  return (
    <>
      <Header
        onEditProfile={isLoggedIn ? () => setProfileDrawerOpen(true) : undefined}
        onSignIn={!isLoggedIn ? () => setAuthModalOpen(true) : undefined}
        onSubmitBook={handleSubmitBookClick}
        onWhatIsThis={!aboutVisible ? handleWhatIsThis : undefined}
        isAdmin={isAdmin}
        displayName={effectiveUser?.name}
      />

      {/* About */}
      {aboutVisible && (
        <AboutBlock ref={aboutRef} onClose={handleCloseAbout} header={introHeader} sections={introSections} />
      )}

      {/* Search + filters */}
      <div
        style={{
          borderBottom: '1px solid var(--border)',
          background: 'var(--bg-input)',
          position: 'sticky',
          top: 'var(--header-height, 57px)',
          transform: isHidden ? 'translateY(calc(-100% - var(--header-height, 57px)))' : 'translateY(0)',
          transition: 'transform 0.25s ease',
          zIndex: 90,
        }}
      >
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
                fontSize: 'var(--filters-search-font-size)',
                color: 'var(--text)',
                background: 'var(--bg-input)',
                border: '1px solid var(--border)',
                borderBottom: '2px solid var(--border-strong)',
                padding: '0.4rem 0.6rem',
                outline: 'none',
              }}
            />
            <button
              className="filters-view-toggle"
              onClick={() => handleSetViewMode(viewMode === 'grid' ? 'list' : 'grid')}
              title={viewMode === 'grid' ? 'Переключить в таблицу' : 'Переключить в сетку'}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.3rem', color: 'var(--text)', display: 'flex', flexShrink: 0 }}
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
                      {showMyBooks ? '✓ Записал:ась' : 'Записал:ась'}
                    </button>
                    <span className="tooltip-text" style={{
                      position: 'absolute',
                      bottom: 'calc(100% + 6px)',
                      left: '50%',
                      transform: 'translateX(-50%)',
                      background: '#222',
                      color: 'var(--bg)',
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
                    onClick={() => setShowRead(v => { const next = !v; setPrefCookie('show_read', String(next)); return next })}
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
        <div style={{ borderBottom: '1px solid var(--border)' }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '1rem 1.5rem' }}>
            <p
              style={{
                fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                fontSize: '0.8rem',
                lineHeight: 1.65,
                color: 'var(--text-secondary)',
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
          <p style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.875rem', color: 'var(--text-muted)', textAlign: 'center', padding: '3rem 0' }}>
            Ничего не найдено
          </p>
        ) : (
          <>
            <div className="catalog-desktop" data-testid="catalog-desktop">
              {viewMode === 'grid' ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '1.5rem' }}>
                  <SubmitBookCard onClick={handleSubmitBookClick} />
                  {filteredBooks.map(book => (
                    <BookCard key={book.id} book={book} isSelected={selectedBooks.includes(book.id)} onToggle={handleToggle} personalStatus={personalStatusMap.get(book.id) ?? null} />
                  ))}
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse', borderTop: '2px solid var(--border-strong)' }}>
                  <tbody>
                    <tr style={{ borderBottom: '2px solid var(--border-strong)', background: 'var(--bg)' }}>
                      <td colSpan={6} style={{ padding: '0.75rem 0.75rem' }}>
                        <button
                          onClick={handleSubmitBookClick}
                          style={{
                            background: 'var(--text)',
                            border: 'none',
                            borderRadius: '2px',
                            padding: '0.4rem 0.85rem',
                            fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                            fontSize: '0.75rem',
                            color: 'var(--bg)',
                            cursor: 'pointer',
                            letterSpacing: '0.04em',
                          }}
                        >
                          + Предложить книгу
                        </button>
                      </td>
                    </tr>
                    {filteredBooks.map(book => (
                      <BookRow key={book.id} book={book} isSelected={selectedBooks.includes(book.id)} onToggle={handleToggle} personalStatus={personalStatusMap.get(book.id) ?? null} />
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            <div className="catalog-mobile" data-testid="catalog-mobile">
              <SubmitBookCard onClick={handleSubmitBookClick} />
              {filteredBooks.map(book => (
                <BookCardMobile key={book.id} book={book} isSelected={selectedBooks.includes(book.id)} onToggle={handleToggle} personalStatus={personalStatusMap.get(book.id) ?? null} />
              ))}
            </div>
          </>
        )}
      </main>

      <Footer onFeedback={() => setFeedbackFormOpen(true)} />

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
            background: 'var(--text)',
            color: 'var(--bg)',
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

        .catalog-mobile { display: none; }
        @media (max-width: 640px) {
          .catalog-desktop { display: none; }
          .catalog-mobile { display: flex; flex-direction: column; gap: 13px; }
          .filters-view-toggle { display: none !important; }
        }
      `}</style>

      {authModalOpen && (
        <AuthModal isOpen={authModalOpen} onClose={() => setAuthModalOpen(false)} />
      )}
      {submitFormOpen && (
        <SubmitBookForm
          isOpen={submitFormOpen}
          onClose={() => setSubmitFormOpen(false)}
          initialAuthor={filterAuthor || undefined}
        />
      )}
      {showContactsForm && (
        <ContactsForm
          defaultName={effectiveUser?.name}
          defaultContacts={effectiveUser?.contacts}
          onSave={handleSaveContacts}
          onClose={() => { setShowContactsForm(false); setPendingBook(null) }}
          onDelete={isLoggedIn ? handleDeleteAccount : undefined}
        />
      )}
      <ProfileDrawer
        isOpen={profileDrawerOpen}
        onClose={() => setProfileDrawerOpen(false)}
        selectedBooks={selectedBooks}
        initialSignups={currentUser?.signups ?? []}
        books={books}
        currentUser={currentUser}
        savedUser={savedUser}
        onSaveContacts={handleSaveContacts}
        onDeleteAccount={handleDeleteAccount}
        onToggleBook={handleToggleById}
      />
      {feedbackFormOpen && (
        <FeedbackForm
          isOpen={feedbackFormOpen}
          onClose={() => setFeedbackFormOpen(false)}
          currentUser={currentUser}
          userEmail={contactEmail ?? undefined}
        />
      )}

      {showPriorityHint && (
        <div
          role="status"
          data-testid="priority-hint-toast"
          onMouseEnter={() => setPriorityHintPaused(true)}
          onMouseLeave={() => setPriorityHintPaused(false)}
          style={{
            position: 'fixed',
            bottom: '1.5rem',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 9999,
            background: 'var(--bg-input)',
            border: '1px solid var(--border-strong)',
            boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
            padding: '0.85rem 1rem',
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            maxWidth: 'calc(100vw - 2rem)',
            width: 'max-content',
            overflow: 'hidden',
          }}
        >
          <style>{`@keyframes priorityHintCountdown { from { transform: scaleX(1); } to { transform: scaleX(0); } }`}</style>
          <p
            style={{
              fontFamily: 'var(--nd-sans), system-ui, sans-serif',
              fontSize: '0.8rem',
              color: 'var(--text)',
              margin: 0,
              lineHeight: 1.4,
            }}
          >
            Кстати, в личном кабинете можно расставить книги по приоритету
          </p>
          <button
            onClick={() => { setShowPriorityHint(false); setProfileDrawerOpen(true) }}
            style={{
              fontFamily: 'var(--nd-sans), system-ui, sans-serif',
              fontSize: '0.7rem',
              textTransform: 'uppercase',
              letterSpacing: '0.06em',
              color: 'var(--bg)',
              background: 'var(--text)',
              border: 'none',
              padding: '0.4rem 0.75rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            Открыть
          </button>
          <button
            onClick={() => setShowPriorityHint(false)}
            aria-label="Закрыть подсказку"
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              fontFamily: 'var(--nd-sans), system-ui, sans-serif',
              fontSize: '0.9rem',
              color: 'var(--text-muted)',
              padding: '0 0.15rem',
              lineHeight: 1,
              flexShrink: 0,
            }}
          >
            ✕
          </button>
          <span
            aria-hidden
            data-testid="priority-hint-progress"
            style={{
              position: 'absolute',
              left: 0,
              bottom: 0,
              height: '2px',
              width: '100%',
              background: 'rgba(17,17,17,0.18)',
              transformOrigin: 'left center',
              animation: 'priorityHintCountdown 20s linear forwards',
              animationPlayState: priorityHintPaused ? 'paused' : 'running',
            }}
          />
        </div>
      )}
    </>
  )
}
