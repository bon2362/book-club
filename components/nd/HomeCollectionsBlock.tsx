'use client'

import Link from 'next/link'
import type { CollectionListItem } from '@/lib/collections/types'
import { track } from '@/lib/analytics'
import CollectionStackCard from './CollectionStackCard'
import CollectionsCarousel from './CollectionsCarousel'

interface Props {
  collections: CollectionListItem[]
  onCreate: () => void
}

export default function HomeCollectionsBlock({ collections, onCreate }: Props) {
  return (
    <section className="home-collections" data-testid="home-collections">
      <div className="home-collections-head">
        <div>
          <h2 className="home-collections-title">Подборки</h2>
          <p className="home-collections-subtitle">Книги, объединённые одной темой</p>
        </div>
        <div className="home-collections-actions">
          <Link href="/collections" className="p-btn ghost sm" onClick={() => track('collections_opened', { source: 'home_block' })}>Все подборки</Link>
          <button type="button" className="p-btn sm" onClick={onCreate}>Собрать свою</button>
        </div>
      </div>
      {collections.length === 0 ? (
        <div className="home-collections-empty">
          <p>
            Пока ни одной подборки. Если вы дочитали книгу с кругом и знаете, что читать дальше, — соберите первую: название, пара абзацев и две-три книги из каталога.
          </p>
          <button type="button" className="p-btn" onClick={onCreate}>Собрать первую подборку</button>
        </div>
      ) : (
        <CollectionsCarousel>
          {collections.map(collection => (
            <CollectionStackCard
              key={collection.id}
              collection={collection}
              onOpen={() => track('collections_opened', { source: 'home_block', collection_id: collection.id })}
            />
          ))}
        </CollectionsCarousel>
      )}
    </section>
  )
}
