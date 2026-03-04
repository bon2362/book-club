'use client'

import { useState } from 'react'
import type { BookWithCover } from '@/lib/books-with-covers'

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

const sans = 'var(--nd-sans), system-ui, sans-serif'
const serif = 'var(--nd-serif), Georgia, serif'

export default function BookRow({ book, isSelected, onToggle }: Props) {
  const [hovered, setHovered] = useState(false)
  const [signupTooltip, setSignupTooltip] = useState(false)
  const isReading = book.status === 'reading'
  const isRead = book.status === 'read'
  const year = extractYear(book.date)

  const accentColor = isReading ? '#C0603A' : isRead ? '#D0D0D0' : 'transparent'

  return (
    <tr
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: hovered ? '#F9F9F9' : isRead ? '#FAFAFA' : '#fff',
        opacity: isRead ? 0.7 : 1,
        transition: 'background 0.1s',
        borderBottom: '1px solid #E5E5E5',
      }}
    >
      {/* Status accent */}
      <td style={{ width: 3, padding: 0, background: accentColor }} />

      {/* Title + Author */}
      <td style={{ padding: '0.6rem 0.75rem', verticalAlign: 'middle' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span style={{ fontFamily: serif, fontWeight: 700, fontSize: '0.95rem', color: '#111', letterSpacing: '-0.01em', lineHeight: 1.2 }}>
            {book.name}
          </span>
          {year && (
            <span style={{ fontFamily: sans, fontSize: '0.65rem', color: '#bbb', flexShrink: 0 }}>
              {year}
            </span>
          )}
        </div>
        <div style={{ fontFamily: sans, fontStyle: 'italic', fontSize: '0.78rem', color: '#888', marginTop: '0.1rem' }}>
          {book.author}
        </div>
      </td>

      {/* Tags */}
      <td style={{ padding: '0.6rem 0.75rem', verticalAlign: 'middle' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
          {book.tags.map(tag => (
            <span key={tag} style={{ fontFamily: sans, fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.09em', color: '#aaa' }}>
              {tag}
            </span>
          ))}
        </div>
      </td>

      {/* Pages + link */}
      <td style={{ padding: '0.6rem 0.75rem', verticalAlign: 'middle', whiteSpace: 'nowrap' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', alignItems: 'flex-start' }}>
          {book.pages && (
            <span style={{ fontFamily: sans, fontSize: '0.7rem', color: '#bbb' }}>
              {book.pages} стр.
            </span>
          )}
          {book.link && (
            <a
              href={book.link}
              target="_blank"
              rel="noopener noreferrer"
              style={{ fontFamily: sans, fontSize: '0.7rem', color: '#111', textDecoration: 'none', borderBottom: '1px solid #111' }}
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
              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem', fontFamily: sans, fontSize: '0.65rem', color: '#bbb', cursor: 'default', userSelect: 'none' }}
            >
              <svg viewBox="0 0 9 11" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ height: '0.6rem', width: 'auto', flexShrink: 0 }}>
                <circle cx="4.5" cy="3" r="2.5" fill="#BBBBBB" />
                <path d="M0.5 10.5C0.5 7.5 2.2 6.5 4.5 6.5C6.8 6.5 8.5 7.5 8.5 10.5" stroke="#BBBBBB" strokeWidth="1" strokeLinecap="round" fill="none" />
              </svg>
              {book.signupCount}
            </span>
            {signupTooltip && (
              <div style={{ position: 'absolute', bottom: 'calc(100% + 4px)', left: '50%', transform: 'translateX(-50%)', background: '#111', color: '#fff', fontFamily: sans, fontSize: '0.65rem', padding: '0.25rem 0.5rem', whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 10 }}>
                {formatSignupCount(book.signupCount)}
              </div>
            )}
          </div>
        )}
      </td>

      {/* Button */}
      <td style={{ padding: '0.6rem 0.75rem', verticalAlign: 'middle', textAlign: 'right' }}>
        <button
          onClick={isRead ? undefined : () => onToggle(book)}
          aria-pressed={isSelected}
          disabled={isRead}
          style={{
            padding: '0.3rem 0.75rem',
            fontFamily: sans,
            fontSize: '0.65rem',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            cursor: isRead ? 'default' : 'pointer',
            border: '1px solid',
            background: isRead ? 'transparent' : isSelected ? '#111' : 'transparent',
            color: isRead ? '#C8C8C8' : isSelected ? '#fff' : '#111',
            borderColor: isRead ? '#C8C8C8' : '#111',
            whiteSpace: 'nowrap',
            transition: 'background 0.15s, color 0.15s',
          }}
        >
          {isRead ? 'Прочитана' : isSelected ? '✓ Записан' : 'Хочу читать'}
        </button>
      </td>
    </tr>
  )
}
