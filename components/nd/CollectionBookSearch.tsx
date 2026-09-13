'use client'

import { useEffect, useState } from 'react'
import type { CollectionBookSearchResult } from '@/lib/collections/types'
import CoverImage from './CoverImage'

interface Props {
  excludeIds: ReadonlySet<string>
  onAdd: (book: CollectionBookSearchResult) => void
}

const MAX_RESULTS = 6

export default function CollectionBookSearch({ excludeIds, onAdd }: Props) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<CollectionBookSearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const q = query.trim()

  useEffect(() => {
    if (q.length < 2) {
      setResults([])
      return
    }
    let cancelled = false
    setLoading(true)
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/api/collections/book-search?q=${encodeURIComponent(q)}`)
        const body = await response.json()
        if (!cancelled) setResults(response.ok ? body.books : [])
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 250)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [q])

  const visible = results.filter((book) => !excludeIds.has(book.id)).slice(0, MAX_RESULTS)
  const showEmpty = q.length >= 2 && !loading && visible.length === 0

  return (
    <div style={{ position: 'relative', marginBottom: 6 }}>
      <input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Найти книгу по названию или автору"
        aria-label="Найти книгу"
        style={{
          width: '100%',
          fontFamily: 'var(--nd-sans)',
          fontSize: 14,
          color: 'var(--text)',
          background: 'var(--bg-input)',
          border: '1px solid var(--border)',
          borderBottom: '2px solid var(--border-strong)',
          padding: '10px 12px',
          outline: 'none',
        }}
      />
      {(visible.length > 0 || showEmpty) && (
        <div
          role="listbox"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: '100%',
            zIndex: 5,
            maxHeight: 250,
            overflow: 'auto',
            background: 'var(--bg-input)',
            border: '1px solid var(--border-strong)',
          }}
        >
          {visible.map((book) => (
            <button
              key={book.id}
              type="button"
              role="option"
              aria-selected={false}
              aria-label={book.title}
              onClick={() => {
                onAdd(book)
                setQuery('')
              }}
              style={{
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                width: '100%',
                padding: '9px 11px',
                textAlign: 'left',
                background: 'none',
                border: 'none',
                borderBottom: '1px solid var(--border-subtle)',
                cursor: 'pointer',
                fontFamily: 'var(--nd-sans)',
              }}
            >
              <span style={{ position: 'relative', width: 24, flex: 'none', aspectRatio: '2 / 3', overflow: 'hidden' }}>
                <CoverImage coverUrl={book.coverUrl} title={book.title} author={book.author} />
              </span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 13, color: 'var(--text)' }}>{book.title}</span>
                <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                  {book.author}
                  {book.year ? `, ${book.year}` : ''}
                  {book.isArticle ? ' · статья' : ''}
                </span>
              </span>
            </button>
          ))}
          {showEmpty && (
            <div style={{ padding: '12px 13px', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.55 }}>
              В каталоге такой книги нет. В подборку можно добавить только книги из каталога — сначала предложите её в каталоге и дождитесь, пока её опубликуют.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
