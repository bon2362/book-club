'use client'

import Link from 'next/link'
import { useState } from 'react'
import type { CollectionListItem } from '@/lib/collections/types'
import { textsCount } from '@/lib/collections/format'
import CoverImage from './CoverImage'

interface Props {
  collection: CollectionListItem
  onOpen?: () => void
}

const COVER_WIDTH = 56
const COVER_OVERLAP = 18

/** Карточка подборки «стопка корешков» — в блоке на главной и на странице «Все подборки». */
export default function CollectionStackCard({ collection, onOpen }: Props) {
  const [hovered, setHovered] = useState(false)

  return (
    <Link
      href={`/collections/${collection.slug}`}
      onClick={onOpen}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      data-testid="collection-card"
      style={{ display: 'flex', flexDirection: 'column', textDecoration: 'none', color: 'var(--text)' }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-end', height: 104 }}>
        {collection.covers.map((cover, index) => (
          <div
            key={cover.id}
            style={{
              position: 'relative',
              width: COVER_WIDTH,
              aspectRatio: '2 / 3',
              flex: 'none',
              marginLeft: index === 0 ? 0 : -COVER_OVERLAP,
              borderRight: '1px solid var(--border)',
              zIndex: index,
              overflow: 'hidden',
            }}
          >
            <CoverImage coverUrl={cover.coverUrl} title={cover.title} author={cover.author} />
          </div>
        ))}
      </div>
      <div style={{ paddingTop: 13, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span style={{ fontFamily: 'var(--nd-mono)', fontSize: 11, color: 'var(--accent)' }}>
          {textsCount(collection.textsCount)}
        </span>
        <span
          style={{
            alignSelf: 'flex-start',
            fontFamily: 'var(--nd-serif)',
            fontWeight: 700,
            fontSize: 21,
            lineHeight: 1.16,
            letterSpacing: '-0.01em',
            borderBottom: `1px solid ${hovered ? 'var(--border-strong)' : 'transparent'}`,
          }}
        >
          {collection.title}
        </span>
      </div>
    </Link>
  )
}
