'use client'

import type { Book } from '@/lib/sheets'

interface Props {
  book: Book
  isSelected: boolean
  onToggle: (book: Book) => void
}

// Format "1/1/2007" → "2007"
function extractYear(date: string): string {
  const parts = date.split('/')
  return parts[parts.length - 1] ?? date
}

export default function BookCard({ book, isSelected, onToggle }: Props) {
  const year = extractYear(book.date)
  const hasLink = book.link && book.link !== 'Link'

  const accentColor = isSelected ? 'var(--success)' : 'var(--accent)'

  return (
    <article
      style={{
        fontFamily: "'Playfair Display', 'Georgia', 'Times New Roman', serif",
        background: 'var(--bg)',
        borderLeft: `4px solid ${accentColor}`,
        boxShadow: isSelected
          ? '4px 4px 0 rgba(45,106,79,0.13), 0 1px 4px var(--shadow-card)'
          : '4px 4px 0 rgba(181,69,27,0.13), 0 1px 4px var(--shadow-card)',
        transition: 'border-color 0.2s ease, box-shadow 0.2s ease',
        padding: '1.5rem 1.5rem 1.25rem 1.25rem',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Decorative corner mark */}
      <span
        aria-hidden
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: 0,
          height: 0,
          borderStyle: 'solid',
          borderWidth: '0 28px 28px 0',
          borderColor: `transparent ${accentColor} transparent transparent`,
          opacity: 0.18,
          transition: 'border-color 0.2s ease',
        }}
      />

      {/* Header row: title + year */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.25rem' }}>
        <h2
          style={{
            fontFamily: "'Playfair Display', 'Georgia', serif",
            fontWeight: 700,
            fontSize: '1.125rem',
            lineHeight: 1.3,
            color: 'var(--text)',
            margin: 0,
            letterSpacing: '-0.01em',
          }}
        >
          {book.name}
        </h2>
        {year && (
          <span
            style={{
              fontFamily: "'Georgia', serif",
              fontSize: '0.7rem',
              color: 'var(--text-muted)',
              letterSpacing: '0.06em',
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
          fontFamily: "'Georgia', serif",
          fontStyle: 'italic',
          fontSize: '0.875rem',
          color: 'var(--text-secondary)',
          margin: '0 0 0.75rem 0',
          letterSpacing: '0.01em',
        }}
      >
        {book.author}
      </p>

      {/* Meta row: pages + link */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          marginBottom: '0.875rem',
          borderTop: '1px solid var(--border-subtle)',
          borderBottom: '1px solid var(--border-subtle)',
          padding: '0.4rem 0',
        }}
      >
        {book.pages && (
          <span
            style={{
              fontSize: '0.7rem',
              fontFamily: "'Georgia', serif",
              color: 'var(--text-muted)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            {book.pages} стр.
          </span>
        )}
        {hasLink && (
          <a
            href={book.link}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Открыть книгу"
            style={{
              marginLeft: 'auto',
              fontSize: '0.65rem',
              fontFamily: "'Georgia', serif",
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--accent)',
              textDecoration: 'none',
              borderBottom: '1px solid var(--accent)',
              paddingBottom: '1px',
              opacity: 0.85,
              transition: 'opacity 0.15s',
            }}
          >
            читать →
          </a>
        )}
      </div>

      {/* Description */}
      {book.description && (
        <p
          style={{
            fontFamily: "'Georgia', serif",
            fontSize: '0.8125rem',
            lineHeight: 1.6,
            color: 'var(--text-body)',
            margin: '0 0 0.875rem 0',
          }}
        >
          {book.description}
        </p>
      )}

      {/* Tags */}
      {book.tags.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', marginBottom: '1rem' }}>
          {book.tags.map((tag) => (
            <span
              key={tag}
              style={{
                fontSize: '0.625rem',
                fontFamily: "'Georgia', serif",
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--text-secondary)',
                background: 'var(--bg-tag)',
                padding: '0.2rem 0.5rem',
                border: '1px solid var(--border)',
              }}
            >
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Toggle button */}
      <button
        onClick={() => onToggle(book)}
        style={{
          display: 'block',
          width: '100%',
          padding: '0.6rem 1rem',
          fontFamily: "'Playfair Display', 'Georgia', serif",
          fontSize: '0.8125rem',
          fontWeight: 600,
          letterSpacing: '0.04em',
          cursor: 'pointer',
          border: `2px solid ${accentColor}`,
          background: isSelected ? 'var(--success)' : 'transparent',
          color: isSelected ? 'var(--bg)' : 'var(--accent)',
          transition: 'all 0.2s ease',
          textAlign: 'center',
        }}
        aria-pressed={isSelected}
      >
        {isSelected ? '✓ Записан' : 'Хочу читать'}
      </button>
    </article>
  )
}
