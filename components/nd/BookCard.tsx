'use client'

import { useState } from 'react'
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

function formatSignupCount(n: number): string {
  const lastTwo = n % 100
  const lastOne = n % 10
  if (lastTwo >= 11 && lastTwo <= 19) return `${n} человек записались`
  if (lastOne === 1) return `${n} человек записался`
  if (lastOne >= 2 && lastOne <= 4) return `${n} человека записались`
  return `${n} человек записались`
}

const DESCRIPTION_CLAMP_THRESHOLD = 120

export default function BookCard({ book, isSelected, onToggle }: Props) {
  const year = extractYear(book.date)
  const [descExpanded, setDescExpanded] = useState(false)
  const [signupTooltip, setSignupTooltip] = useState(false)
  const isLongDescription = book.description.length > DESCRIPTION_CLAMP_THRESHOLD
  const isReading = book.status === 'reading'
  const isRead = book.status === 'read'

  return (
    <article
      style={{
        display: 'flex',
        flexDirection: 'column',
        border: isReading ? '2px solid #C0603A' : isRead ? '1px solid #C8C8C8' : '1px solid #E5E5E5',
        background: isRead ? '#F7F7F7' : '#fff',
        position: 'relative',
      }}
    >
      {/* Cover — 2:3 aspect ratio */}
      <div style={{ aspectRatio: '2/3', width: '100%', overflow: 'hidden', position: 'relative' }}>
        <div style={{ opacity: isRead ? 0.45 : 1, height: '100%' }}>
          <CoverImage coverUrl={book.coverUrl} title={book.name} author={book.author} />
        </div>
        {isRead && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(240,240,240,0.35)',
            }}
          >
            <span
              style={{
                fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                fontSize: '0.6rem',
                textTransform: 'uppercase',
                letterSpacing: '0.12em',
                color: '#555',
                background: 'rgba(255,255,255,0.85)',
                padding: '0.3rem 0.65rem',
                border: '1px solid #C8C8C8',
              }}
            >
              Прочитано
            </span>
          </div>
        )}
        {isReading && (
          <div
            style={{
              position: 'absolute',
              top: '0.5rem',
              left: '0.5rem',
              background: '#C0603A',
              color: '#fff',
              fontFamily: 'var(--nd-sans), system-ui, sans-serif',
              fontSize: '0.6rem',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              padding: '0.25rem 0.5rem',
            }}
          >
            Сейчас читаем
          </div>
        )}
      </div>

      {/* Tags + signup count */}
      {(book.tags.length > 0 || !!book.signupCount) && (
        <div style={{ padding: '0.75rem 0.75rem 0', display: 'flex', flexWrap: 'wrap', gap: '0.375rem', alignItems: 'center' }}>
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
          {!!book.signupCount && (
            <div style={{ marginLeft: 'auto', position: 'relative', flexShrink: 0 }}>
              <span
                onMouseEnter={() => setSignupTooltip(true)}
                onMouseLeave={() => setSignupTooltip(false)}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                  fontSize: '0.6rem',
                  lineHeight: '1',
                  color: '#999',
                  cursor: 'default',
                  userSelect: 'none',
                }}
              >
                <svg viewBox="0 0 9 11" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ height: '0.6rem', width: 'auto', flexShrink: 0 }}>
                  <circle cx="4.5" cy="3" r="2.5" fill="#BBBBBB" />
                  <path d="M0.5 10.5C0.5 7.5 2.2 6.5 4.5 6.5C6.8 6.5 8.5 7.5 8.5 10.5" stroke="#BBBBBB" strokeWidth="1" strokeLinecap="round" fill="none" />
                </svg>
                {book.signupCount}
              </span>
              {signupTooltip && (
                <div
                  style={{
                    position: 'absolute',
                    bottom: 'calc(100% + 4px)',
                    right: 0,
                    background: '#111',
                    color: '#fff',
                    fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                    fontSize: '0.65rem',
                    padding: '0.25rem 0.5rem',
                    whiteSpace: 'nowrap',
                    pointerEvents: 'none',
                    zIndex: 10,
                  }}
                >
                  {formatSignupCount(book.signupCount)}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Rule */}
      <div style={{ margin: '0.5rem 0.75rem 0', borderTop: '1px solid #111' }} />

      {/* Status badge */}
      {(isReading || isRead) && (
        <div style={{ padding: '0.5rem 0.75rem 0' }}>
          <span
            style={{
              fontFamily: 'var(--nd-sans), system-ui, sans-serif',
              fontSize: '0.6rem',
              textTransform: 'uppercase',
              letterSpacing: '0.1em',
              color: isRead ? '#999' : '#C0603A',
              borderBottom: `1px solid ${isRead ? '#C8C8C8' : '#C0603A'}`,
              paddingBottom: '0.1rem',
            }}
          >
            {isRead ? 'Прочитано' : 'Сейчас читаем'}
          </span>
        </div>
      )}

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

      {/* Pages + Link */}
      {(book.pages || book.link) && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            margin: '0.25rem 0.75rem 0',
          }}
        >
          {book.pages && (
            <span
              style={{
                fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                fontSize: '0.7rem',
                color: '#999',
              }}
            >
              {book.pages} стр.
            </span>
          )}
          {book.link && (
            <a
              href={book.link}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                fontSize: '0.7rem',
                color: '#111',
                textDecoration: 'none',
                borderBottom: '1px solid #111',
              }}
            >
              Читать
            </a>
          )}
        </div>
      )}

      {/* Description */}
      {book.description && (
        <div style={{ margin: '0.5rem 0.75rem 0' }}>
          <p
            style={{
              fontFamily: 'var(--nd-sans), system-ui, sans-serif',
              fontSize: '0.78rem',
              lineHeight: 1.55,
              color: '#666',
              margin: 0,
              ...(descExpanded ? {} : {
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }),
            }}
          >
            {book.description}
          </p>
          {isLongDescription && (
            <button
              onClick={() => setDescExpanded(e => !e)}
              style={{
                background: 'none',
                border: 'none',
                padding: '0.25rem 0 0',
                fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                fontSize: '0.7rem',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: '#999',
                cursor: 'pointer',
              }}
            >
              {descExpanded ? 'Свернуть' : 'Читать далее'}
            </button>
          )}
        </div>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* Toggle button */}
      <div style={{ padding: '0.75rem' }}>
        <button
          onClick={isRead ? undefined : () => onToggle(book)}
          aria-pressed={isSelected}
          disabled={isRead}
          style={{
            display: 'block',
            width: '100%',
            padding: '0.5rem 1rem',
            fontFamily: 'var(--nd-sans), system-ui, sans-serif',
            fontSize: '0.7rem',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            cursor: isRead ? 'default' : 'pointer',
            border: '1px solid #C8C8C8',
            background: isRead ? 'transparent' : isSelected ? '#111' : 'transparent',
            color: isRead ? '#BBBBBB' : isSelected ? '#fff' : '#111',
            borderColor: isRead ? '#C8C8C8' : '#111',
            transition: 'background 0.15s, color 0.15s',
          }}
        >
          {isRead ? 'Уже прочитана' : isSelected ? '✓ Записан' : 'Хочу читать'}
        </button>
      </div>
    </article>
  )
}
