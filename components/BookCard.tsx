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

  return (
    <article
      style={{
        fontFamily: "'Playfair Display', 'Georgia', 'Times New Roman', serif",
        background: '#F9F5EE',
        borderLeft: `4px solid ${isSelected ? '#2D6A4F' : '#B5451B'}`,
        boxShadow: isSelected
          ? '4px 4px 0 #2D6A4F22, 0 1px 4px rgba(0,0,0,0.08)'
          : '4px 4px 0 #B5451B22, 0 1px 4px rgba(0,0,0,0.06)',
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
          borderColor: `transparent ${isSelected ? '#2D6A4F' : '#B5451B'} transparent transparent`,
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
            color: '#1A1714',
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
              color: '#8C7B6B',
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
          color: '#5C4A3A',
          margin: '0 0 0.75rem 0',
          letterSpacing: '0.01em',
        }}
      >
        {book.author}
      </p>

      {/* Meta row: pages + size */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1rem',
          marginBottom: '0.875rem',
          borderTop: '1px solid #E2D8CC',
          borderBottom: '1px solid #E2D8CC',
          padding: '0.4rem 0',
        }}
      >
        {book.pages && (
          <span
            style={{
              fontSize: '0.7rem',
              fontFamily: "'Georgia', serif",
              color: '#8C7B6B',
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
              color: '#B5451B',
              textDecoration: 'none',
              borderBottom: '1px solid #B5451B',
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
            color: '#3D3028',
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
                color: '#5C4A3A',
                background: '#EDE5D8',
                padding: '0.2rem 0.5rem',
                border: '1px solid #D4C4B0',
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
          border: `2px solid ${isSelected ? '#2D6A4F' : '#B5451B'}`,
          background: isSelected ? '#2D6A4F' : 'transparent',
          color: isSelected ? '#F9F5EE' : '#B5451B',
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
