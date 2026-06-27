'use client'

import { useState } from 'react'
import type { BookWithCover } from '@/lib/books-with-covers'
import type { PersonalBookStatus } from '@/lib/signup-books'

interface Props {
  book: BookWithCover
  isSelected: boolean
  onToggle: (book: BookWithCover) => void
  personalStatus?: PersonalBookStatus | null
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

const sans = 'var(--nd-sans), system-ui, sans-serif'
const serif = 'var(--nd-serif), Georgia, serif'

export default function BookRow({ book, isSelected, onToggle, personalStatus }: Props) {
  const [hovered, setHovered] = useState(false)
  const [signupTooltip, setSignupTooltip] = useState(false)
  const isReading = book.status === 'reading'
  const isRead = book.status === 'read'
  const year = extractYear(book.date)

  const accentColor = isReading ? 'var(--accent)' : isRead ? 'var(--text-muted)' : 'transparent'

  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? 'var(--bg-elevated)' : isRead ? 'var(--bg-elevated)' : 'var(--bg-input)',
        opacity: isRead ? 0.7 : 1,
        transition: 'background 0.1s',
        borderBottom: '1px solid var(--border)',
      }}
    >
      {/* Status accent */}
      <td style={{ width: 3, padding: 0, background: accentColor }} />

      {/* Title + Author */}
      <td style={{ padding: '0.6rem 0.75rem', verticalAlign: 'middle' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: serif, fontWeight: 700, fontSize: '0.95rem', color: 'var(--text)', letterSpacing: '-0.01em', lineHeight: 1.2 }}>
            {book.name}
          </span>
          {book.isNew && (
            <span style={{ fontFamily: sans, fontSize: '0.55rem', textTransform: 'uppercase', letterSpacing: '0.12em', background: 'var(--accent)', color: 'var(--bg)', padding: '0.15rem 0.4rem', flexShrink: 0 }}>
              Новая
            </span>
          )}
          {year && (
            <span style={{ fontFamily: sans, fontSize: '0.65rem', color: 'var(--text-muted)', flexShrink: 0 }}>
              {year}
            </span>
          )}
          {book.summaryCount > 0 && (
            <a
              href={`/books/${book.slug ?? book.id}/summaries`}
              style={{ fontFamily: sans, fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--accent)', textDecoration: 'none', borderBottom: '1px solid var(--accent)' }}
            >
              ✦ {book.summaryCount === 1 ? 'Саммари' : `${book.summaryCount} саммари`}
            </a>
          )}
        </div>
        <div style={{ fontFamily: sans, fontStyle: 'italic', fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
          {book.author}
        </div>
      </td>

      {/* Tags */}
      <td style={{ padding: '0.6rem 0.75rem', verticalAlign: 'middle' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          {book.tags.map(tag => (
            <span key={tag} style={{ fontFamily: sans, fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.09em', color: 'var(--text-muted)' }}>
              {tag}
            </span>
          ))}
        </div>
      </td>

      {/* Pages + link */}
      <td style={{ padding: '0.6rem 0.75rem', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', alignItems: 'flex-start' }}>
          {book.pages && (
            <span style={{ fontFamily: sans, fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              {book.pages} стр.
            </span>
          )}
          {book.link && (
            <a
              href={book.link}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontFamily: sans, fontSize: '0.7rem', color: 'var(--text)', textDecoration: 'none', borderBottom: '1px solid var(--border-strong)' }}
            >
              Читать
            </a>
          )}
        </div>
      </td>

      {/* Signup count */}
      <td style={{ padding: '0.6rem 0.75rem', verticalAlign: 'middle', textAlign: 'center' }}>
        {!!book.signupCount && (
          <div style={{ position: 'relative', display: 'inline-block' }}>
            <span
              onMouseEnter={() => setSignupTooltip(true)}
              onMouseLeave={() => setSignupTooltip(false)}
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontFamily: sans, fontSize: '0.65rem', color: 'var(--text-muted)', cursor: 'default', userSelect: 'none' }}
            >
              <svg viewBox="0 0 9 11" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ height: '0.6rem', width: 'auto', flexShrink: 0 }}>
                <circle cx="4.5" cy="3" r="2.5" style={{ fill: 'var(--text-muted)' }} />
                <path d="M0.5 10.5C0.5 7.5 2.2 6.5 4.5 6.5C6.8 6.5 8.5 7.5 8.5 10.5" style={{ stroke: 'var(--text-muted)' }} strokeWidth="1" strokeLinecap="round" fill="none" />
              </svg>
              {book.signupCount}
            </span>
            {signupTooltip && (
              <div style={{ position: 'absolute', bottom: 'calc(100% + 4px)', left: '50%', transform: 'translateX(-50%)', background: 'var(--text)', color: 'var(--bg)', fontFamily: sans, fontSize: '0.65rem', padding: '0.25rem 0.5rem', whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 10 }}>
                {formatSignupCount(book.signupCount)}
              </div>
            )}
          </div>
        )}
      </td>

      {/* Button / personal status label */}
      <td style={{ padding: '0.6rem 0.75rem', verticalAlign: 'middle', textAlign: 'right' }}>
        {personalStatus === 'reading' || personalStatus === 'read' ? (
          <span
            style={{
              display: 'inline-block',
              padding: '0.3rem 0.75rem',
              fontFamily: sans,
              fontSize: '0.65rem',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              border: '1px solid var(--border)',
              color: 'var(--text-muted)',
              whiteSpace: 'nowrap',
            }}
          >
            {personalStatus === 'reading' ? 'Читаю сейчас' : 'Прочитал:а'}
          </span>
        ) : (
          <button
            onClick={() => onToggle(book)}
            aria-pressed={isSelected}
            style={{
              padding: '0.3rem 0.75rem',
              fontFamily: sans,
              fontSize: '0.65rem',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              cursor: 'pointer',
              border: '1px solid var(--border-strong)',
              background: isSelected ? 'var(--text)' : 'transparent',
              color: isSelected ? 'var(--bg)' : 'var(--text)',
              whiteSpace: 'nowrap',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            {isSelected ? '✓ Вы записаны' : 'Хочу читать'}
          </button>
        )}
      </td>
    </tr>
  )
}
