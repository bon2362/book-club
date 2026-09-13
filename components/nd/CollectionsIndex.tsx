'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import type { CollectionListItem } from '@/lib/collections/types'
import { collectionsCount } from '@/lib/collections/format'
import { consumeCreateIntent, saveCreateIntent } from '@/lib/collections/intents'
import { track } from '@/lib/analytics'
import Header from './Header'
import AuthModal from './AuthModal'
import CollectionStackCard from './CollectionStackCard'

interface Props {
  collections: CollectionListItem[]
  isLoggedIn: boolean
  isAdmin: boolean
  /** Пришли с /collections/new без входа. */
  openCreate: boolean
}

export default function CollectionsIndex({ collections, isLoggedIn, isAdmin, openCreate }: Props) {
  const [authOpen, setAuthOpen] = useState(false)

  useEffect(() => {
    if (isLoggedIn && consumeCreateIntent()) {
      window.location.assign('/collections/new')
      return
    }
    if (!isLoggedIn && openCreate) {
      saveCreateIntent()
      setAuthOpen(true)
    }
  }, [isLoggedIn, openCreate])

  function handleCreate() {
    if (isLoggedIn) {
      window.location.assign('/collections/new')
      return
    }
    saveCreateIntent()
    track('auth_modal_opened', { trigger: 'collection_create' })
    setAuthOpen(true)
  }

  return (
    <>
      <Header onSignIn={!isLoggedIn ? () => setAuthOpen(true) : undefined} isAdmin={isAdmin} />
      <main className="collections-index" style={{ padding: 26, maxWidth: 1180, margin: '0 auto' }}>
        <Link href="/" className="p-link muted" style={{ fontSize: 11 }}>← На главную</Link>

        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 16, margin: '14px 0', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--accent)' }}>
              Подборки
            </div>
            <h1 style={{ fontFamily: 'var(--nd-serif)', fontWeight: 700, fontSize: 24, lineHeight: 1.15, letterSpacing: '-0.01em', margin: '6px 0 0' }}>
              Все подборки
            </h1>
            <p style={{ fontSize: 12, color: 'var(--text-secondary)', maxWidth: 460, lineHeight: 1.5, margin: '6px 0 0' }}>
              Собраны участниками клуба. Первыми — те, что недавно создали или изменили.
            </p>
          </div>
          <button type="button" className="p-btn sm" onClick={handleCreate}>Собрать свою</button>
        </div>

        <div style={{ display: 'flex', borderTop: '1px solid var(--border)', paddingTop: 12, marginBottom: 18 }}>
          {collections.length > 0 && (
            <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--text-muted)' }}>
              {collectionsCount(collections.length)}
            </span>
          )}
        </div>

        {collections.length === 0 ? (
          <div style={{ border: '1px dashed var(--border)', padding: '30px 22px', textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, maxWidth: 420, margin: '0 auto' }}>
              Подборок пока нет. Первую может собрать любой вошедший: название, пара абзацев о том, зачем это читать, и хотя бы две книги.
            </p>
            <button type="button" className="p-btn" style={{ marginTop: 16 }} onClick={handleCreate}>Собрать первую</button>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
            {collections.map((collection) => (
              <CollectionStackCard
                key={collection.id}
                collection={collection}
                onOpen={() => track('collections_opened', { source: 'collections_index', collection_id: collection.id })}
              />
            ))}
          </div>
        )}
      </main>
      <AuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        callbackUrl="/collections"
        entryPoint="collection_create"
        title="Чтобы собрать подборку, войдите"
        description="После входа откроется редактор подборки."
      />
    </>
  )
}
