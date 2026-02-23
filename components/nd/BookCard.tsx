'use client'

import type { BookWithCover } from '@/lib/books-with-covers'
import CoverImage from './CoverImage'

interface Props {
  book: BookWithCover
  isSelected: boolean
  onToggle: (book: BookWithCover) => void
}

function extractYear(date: string): string {
  const parts = date.split('/')
  return parts[parts.length - 1] ?? date
}

export default function BookCard({ book, isSelected, onToggle }: Props) {
  const year = extractYear(book.date)

  return (
    <article
      style={{
        display: 'flex',
        flexDirection: 'column',
        border: '1px solid #E5E5E5',
        background: '#fff',
      }}
    >
      {/* Cover — 2:3 aspect ratio */}
      <div style={{ aspectRatio: '2/3', width: '100%', overflow: 'hidden' }}>
        <CoverImage coverUrl={book.coverUrl} title={book.name} author={book.author} />
      </div>

      {/* Tags */}
      {book.tags.length > 0 && (
        <div style={{ padding: '0.75rem 0.75rem 0', display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
          {book.tags.map(tag => (
            <span
              key={tag}
              style={{
                fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                fontSize: '0.6rem',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: '#999',
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Rule */}
      <div style={{ margin: '0.5rem 0.75rem 0', borderTop: '1px solid #111' }} />

      {/* Title + Year */}
      <div style={{ padding: '0.5rem 0.75rem 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
        <h2
          style={{
            fontFamily: 'var(--nd-serif), Georgia, serif',
            fontWeight: 700,
            fontSize: '1.05rem',
            lineHeight: 1.25,
            color: '#111',
            margin: 0,
            letterSpacing: '-0.01em',
          }}
        >
          {book.name}
        </h2>
        {year && (
          <span
            style={{
              fontFamily: 'var(--nd-sans), system-ui, sans-serif',
              fontSize: '0.65rem',
              color: '#999',
              whiteSpace: 'nowrap',
              marginTop: '0.2rem',
              flexShrink: 0,
            }}
          >
            {year}
          </span>
        )}
      </div>

      {/* Author */}
      <p
        style={{
          fontFamily: 'var(--nd-sans), system-ui, sans-serif',
          fontStyle: 'italic',
          fontSize: '0.8rem',
          color: '#666',
          margin: '0.25rem 0.75rem 0',
        }}
      >
        {book.author}
      </p>

      {/* Description */}
      {book.description && (
        <p
          style={{
            fontFamily: 'var(--nd-sans), system-ui, sans-serif',
            fontSize: '0.78rem',
            lineHeight: 1.55,
            color: '#666',
            margin: '0.5rem 0.75rem 0',
            display: '-webkit-box',
            WebkitLineClamp: 3,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {book.description}
        </p>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Toggle button */}
      <div style={{ padding: '0.75rem' }}>
        <button
          onClick={() => onToggle(book)}
          aria-pressed={isSelected}
          style={{
            display: 'block',
            width: '100%',
            padding: '0.5rem 1rem',
            fontFamily: 'var(--nd-sans), system-ui, sans-serif',
            fontSize: '0.7rem',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            cursor: 'pointer',
            border: '1px solid #111',
            background: isSelected ? '#111' : 'transparent',
            color: isSelected ? '#fff' : '#111',
            transition: 'background 0.15s, color 0.15s',
          }}
        >
          {isSelected ? '✓ Записан' : 'Хочу читать'}
        </button>
      </div>
    </article>
  )
}
