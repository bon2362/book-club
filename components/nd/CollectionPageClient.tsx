'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'
import type { BookWithCover } from '@/lib/books'
import type { UserSignupState } from '@/lib/signup-books'
import type { SerializedCollection } from '@/lib/collections/types'
import { formatChangedAt, textsCount } from '@/lib/collections/format'
import { consumeSignupIntent, saveSignupIntent } from '@/lib/collections/intents'
import { track } from '@/lib/analytics'
import Header from './Header'
import AuthModal from './AuthModal'
import ContactsForm from './ContactsForm'
import AuthorAvatar from './AuthorAvatar'
import SummaryMarkdown from './SummaryMarkdown'
import BookCard from './BookCard'
import BookCardMobile from './BookCardMobile'
import CollectionStatusBanner from './CollectionStatusBanner'

interface Props {
  collection: SerializedCollection
  books: Array<{ book: BookWithCover; hiddenFromCatalog: boolean }>
  viewer: { isLoggedIn: boolean; isAdmin: boolean; canEdit: boolean }
  signupState: UserSignupState | null
}

const eyebrow: React.CSSProperties = { fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.15em' }

function OrderLine({ index, hidden }: { index: number; hidden: boolean }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: 8,
        padding: '0 0 7px',
        minHeight: 20,
        fontFamily: 'var(--nd-mono)',
        fontSize: 11,
        color: 'var(--text-muted)',
      }}
    >
      <span>№ {String(index + 1).padStart(2, '0')}</span>
      {hidden && <span style={{ color: 'var(--accent)' }}>скрыта из каталога</span>}
    </div>
  )
}

export default function CollectionPageClient({ collection, books, viewer, signupState }: Props) {
  const router = useRouter()
  const ref = collection.slug ?? collection.id
  const [selected, setSelected] = useState(() => new Set(signupState?.selectedBookIds ?? []))
  const [authOpen, setAuthOpen] = useState(false)
  const [contactsForBookId, setContactsForBookId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Относительная дата («3 дня назад») зависит от часов посетителя — считаем после гидратации.
  const [changed, setChanged] = useState<{ relative: string; absolute: string } | null>(null)
  const intentHandled = useRef(false)

  useEffect(() => {
    const changedAt = collection.editedAt ?? collection.publishedAt ?? collection.updatedAt
    setChanged(formatChangedAt(new Date(changedAt), new Date()))
  }, [collection.editedAt, collection.publishedAt, collection.updatedAt])

  useEffect(() => {
    track('collection_viewed', {
      collection_id: collection.id,
      viewer: viewer.canEdit ? 'author' : viewer.isLoggedIn ? 'member' : 'guest',
    })
  }, [collection.id, viewer.canEdit, viewer.isLoggedIn])

  const addBook = useCallback(async (bookId: string, source: 'click' | 'after_login') => {
    setError(null)
    const response = await fetch(`/api/signup-books/${encodeURIComponent(bookId)}`, { method: 'POST' })
    if (response.status === 409) {
      setContactsForBookId(bookId)
      return
    }
    if (!response.ok) {
      setError('Не удалось записаться на книгу. Попробуйте ещё раз.')
      return
    }
    setSelected((current) => new Set(current).add(bookId))
    track('collection_book_signup', { collection_id: collection.id, book_id: bookId, source })
    router.refresh()
  }, [collection.id, router])

  const removeBook = useCallback(async (bookId: string) => {
    setError(null)
    const response = await fetch(`/api/signup-books/${encodeURIComponent(bookId)}`, { method: 'DELETE' })
    if (!response.ok) {
      setError('Не удалось убрать книгу из списка. Попробуйте ещё раз.')
      return
    }
    setSelected((current) => {
      const next = new Set(current)
      next.delete(bookId)
      return next
    })
    track('collection_book_unsignup', { collection_id: collection.id, book_id: bookId })
    router.refresh()
  }, [collection.id, router])

  // Гость нажимал «Хочу читать» до входа — после возврата на подборку записываем книгу один раз.
  useEffect(() => {
    if (!viewer.isLoggedIn || intentHandled.current) return
    intentHandled.current = true
    const bookId = consumeSignupIntent(ref)
    if (bookId && books.some((item) => item.book.id === bookId) && !selected.has(bookId)) {
      void addBook(bookId, 'after_login')
    }
  }, [viewer.isLoggedIn, ref, books, selected, addBook])

  function handleToggle(book: BookWithCover) {
    if (!viewer.isLoggedIn) {
      saveSignupIntent({ collectionRef: ref, bookId: book.id })
      track('auth_modal_opened', { trigger: 'collection_book_signup' })
      setAuthOpen(true)
      return
    }
    if (selected.has(book.id)) {
      void removeBook(book.id)
    } else {
      void addBook(book.id, 'click')
    }
  }

  async function handleSaveContacts(name: string, contacts: string) {
    const response = await fetch('/api/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, contacts }),
    })
    if (!response.ok) throw new Error(`Profile save failed: ${response.status}`)
    const bookId = contactsForBookId
    setContactsForBookId(null)
    if (bookId) await addBook(bookId, 'click')
  }

  async function copyLink() {
    await navigator.clipboard.writeText(`${window.location.origin}/collections/${ref}`)
    setCopied(true)
    track('collection_link_copied', { collection_id: collection.id })
    window.setTimeout(() => setCopied(false), 2000)
  }

  const cardProps = (book: BookWithCover, index: number) => ({
    book,
    isSelected: selected.has(book.id),
    onToggle: handleToggle,
    personalStatus: signupState?.personalStatuses[book.id] ?? null,
    position: index + 1,
    ignoreClubStatus: true,
  })

  return (
    <>
      <Header
        onSignIn={!viewer.isLoggedIn ? () => setAuthOpen(true) : undefined}
        isAdmin={viewer.isAdmin}
        displayName={signupState?.name}
      />
      <main className="collection-page">
        {/* Текст читают — колонка 760 px. Книги просматривают — сетка шире, как в каталоге. */}
        <div className="collection-hero" style={{ maxWidth: 760, margin: '0 auto', padding: '0 26px' }}>
        {viewer.canEdit && collection.status !== 'published' && (
          <CollectionStatusBanner status={collection.status} reason={collection.moderationReason} />
        )}

        <section style={{ padding: '34px 0 20px' }}>
          <div style={{ display: 'flex', gap: 10, marginBottom: 14 }}>
            <span style={{ ...eyebrow, color: 'var(--accent)' }}>Подборка</span>
            <span style={{ ...eyebrow, color: 'var(--text-muted)' }}>{textsCount(books.length)}</span>
          </div>
          <h1
            className="collection-title"
            style={{
              fontFamily: 'var(--nd-serif)',
              fontWeight: 700,
              fontSize: 34,
              lineHeight: 1.1,
              letterSpacing: '-0.02em',
              textWrap: 'pretty',
              margin: 0,
            }}
          >
            {collection.title}
          </h1>
          <div
            className="collection-description"
            style={{ fontFamily: 'var(--nd-serif)', fontSize: 16, lineHeight: 1.65, color: 'var(--text-body)', marginTop: 16 }}
          >
            <SummaryMarkdown markdown={collection.descriptionMarkdown} />
          </div>

          <div
            data-testid="collection-byline"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 14,
              marginTop: 22,
              paddingTop: 18,
              borderTop: '1px solid var(--border)',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <AuthorAvatar name={collection.displayName || '?'} size={28} />
              <div>
                <div style={{ fontSize: 13, color: 'var(--text)' }}>
                  Собрал:а <b style={{ fontWeight: 500 }}>{collection.displayName}</b>
                </div>
                {changed && (
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    изменена {changed.relative} · {changed.absolute}
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="p-btn ghost sm" onClick={copyLink} data-testid="collection-copy-link">
                {copied ? 'Ссылка скопирована' : 'Скопировать ссылку'}
              </button>
              {viewer.canEdit && (
                <Link className="p-btn ghost sm" href={`/collections/${collection.id}/edit`}>Править</Link>
              )}
            </div>
          </div>
        </section>

        {error && <p style={{ fontSize: 12, color: 'var(--accent)', marginTop: 14 }}>{error}</p>}
        </div>

        {/* Значения сетки те же, что в каталоге (BooksPage): minmax(220px, 1fr), gap 1.5rem. */}
        <div className="collection-books" style={{ maxWidth: 1180, margin: '0 auto', padding: '0 1.5rem 44px' }}>
          <div
            className="catalog-desktop"
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
              gap: '1.5rem',
              alignItems: 'stretch',
              paddingTop: 22,
            }}
          >
            {books.map(({ book, hiddenFromCatalog }, index) => (
              <div key={book.id} data-testid="collection-item" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                <OrderLine index={index} hidden={hiddenFromCatalog} />
                <BookCard {...cardProps(book, index)} />
              </div>
            ))}
          </div>
          <div className="catalog-mobile">
            {books.map(({ book, hiddenFromCatalog }, index) => (
              <div key={book.id} data-testid="collection-item-mobile">
                <OrderLine index={index} hidden={hiddenFromCatalog} />
                <BookCardMobile {...cardProps(book, index)} />
              </div>
            ))}
          </div>
        </div>
      </main>

      <AuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        callbackUrl={`/collections/${ref}`}
        entryPoint="collection_book_signup"
        title="Чтобы записаться на книгу, войдите"
        description="После входа вернём вас на эту же подборку, и книга сразу попадёт в ваш список."
      />
      {contactsForBookId && (
        <ContactsForm
          defaultName={signupState?.name}
          defaultContacts={signupState?.contacts}
          onSave={handleSaveContacts}
          onClose={() => setContactsForBookId(null)}
        />
      )}
    </>
  )
}
