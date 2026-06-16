'use client'

import { useEffect, useRef, useState } from 'react'
import type { BookWithCover } from '@/lib/books-with-covers'
import type { PersonalBookStatus } from '@/lib/signup-books'
import CoverImage from './CoverImage'

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

const DESCRIPTION_CLAMP_THRESHOLD = 120

function parseRecommendationLink(raw: string): { text: string; url: string } | null {
  const idx = Math.max(raw.lastIndexOf('https://'), raw.lastIndexOf('http://'))
  if (idx === -1) return null
  const url = raw.slice(idx).trim()
  const text = raw.slice(0, idx).trim()
  if (!text) return null
  return { text, url }
}

const SUBMITTED_BY_MEMBER_LABEL = 'Эта книга предложена участни:цей клуба'

export default function BookCardMobile({ book, isSelected, onToggle, personalStatus }: Props) {
  const year = extractYear(book.date)
  const [descExpanded, setDescExpanded] = useState(false)
  const [signupTooltip, setSignupTooltip] = useState(false)
  const [submittedTooltip, setSubmittedTooltip] = useState(false)
  const submittedBadgeRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!submittedTooltip) return
    const onDocPointer = (e: Event) => {
      if (submittedBadgeRef.current && !submittedBadgeRef.current.contains(e.target as Node)) {
        setSubmittedTooltip(false)
      }
    }
    document.addEventListener('pointerdown', onDocPointer)
    return () => document.removeEventListener('pointerdown', onDocPointer)
  }, [submittedTooltip])

  const isLongDescription = book.description.length > DESCRIPTION_CLAMP_THRESHOLD
  const isReading = book.status === 'reading'
  const isRead = book.status === 'read'

  return (
    // Корневой <div> (а не <article>), чтобы глобальный e2e-селектор
    // `locator('article')` продолжал означать только десктоп-карточку
    // (BookCard) — обе раскладки одновременно присутствуют в DOM и
    // переключаются media-query, поэтому общий тег создал бы дубли.
    <div
      data-testid="book-card-mobile"
      style={{
        padding: '14px 13px',
        background: isRead ? '#F4F1EA' : '#FFFFFF',
        border: isReading ? '2px solid var(--accent)' : '1px solid var(--border)',
        position: 'relative',
      }}
    >
      {/* Шапка: обложка + мета */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
        {/* Обложка */}
        <div
          style={{
            position: 'relative',
            width: 64,
            height: 96,
            borderRadius: 1,
            overflow: 'hidden',
            flexShrink: 0,
            opacity: isRead ? 0.5 : 1,
            filter: isRead ? 'grayscale(0.3)' : 'none',
          }}
        >
          <CoverImage coverUrl={book.coverUrl} title={book.name} author={book.author} />
        </div>

        {/* Колонка меты */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Строка бейджей */}
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', marginBottom: 4 }}>
            {book.tags[0] && (
              <span
                style={{
                  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                  fontSize: 9.5,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: 'var(--text-muted)',
                }}
              >
                {book.tags[0]}
              </span>
            )}
            {isReading && (
              <span
                style={{
                  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                  fontSize: 8.5,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: 'var(--accent)',
                  borderBottom: '1px solid var(--accent)',
                  paddingBottom: 1,
                }}
              >
                Сейчас читаем
              </span>
            )}
            {isRead && (
              <span
                style={{
                  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                  fontSize: 8.5,
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                  color: 'var(--text-muted)',
                  borderBottom: '1px solid #C8C0B2',
                  paddingBottom: 1,
                }}
              >
                Прочитано
              </span>
            )}
            {book.isNew && !isReading && !isRead && (
              <span
                style={{
                  fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                  fontSize: 8.5,
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  background: 'var(--accent)',
                  color: '#fff',
                  padding: '2px 5px',
                }}
              >
                Новая
              </span>
            )}
            {book.submittedByMember && (
              <div
                ref={submittedBadgeRef}
                role="button"
                tabIndex={0}
                aria-describedby={submittedTooltip ? 'mobile-submitted-book-tooltip' : undefined}
                aria-expanded={submittedTooltip}
                aria-label={SUBMITTED_BY_MEMBER_LABEL}
                onMouseEnter={() => setSubmittedTooltip(true)}
                onMouseLeave={() => {
                  if (document.activeElement !== submittedBadgeRef.current) setSubmittedTooltip(false)
                }}
                onFocus={() => setSubmittedTooltip(true)}
                onBlur={() => setSubmittedTooltip(false)}
                onClick={() => setSubmittedTooltip(true)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setSubmittedTooltip(true)
                  }
                }}
                style={{
                  position: 'relative',
                  background: 'var(--accent)',
                  padding: '2px 4px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'help',
                }}
              >
                <svg
                  viewBox="0 0 12 14"
                  width="9"
                  height="11"
                  fill="none"
                  stroke="#fff"
                  strokeWidth="1.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                  style={{ display: 'block' }}
                >
                  <path d="M6 1 C3.5 1 1.8 2.8 1.8 5.1 C1.8 6.6 2.6 7.8 3.7 8.6 L3.7 10.3 L8.3 10.3 L8.3 8.6 C9.4 7.8 10.2 6.6 10.2 5.1 C10.2 2.8 8.5 1 6 1 Z" />
                  <line x1="4.2" y1="11.6" x2="7.8" y2="11.6" />
                  <line x1="4.8" y1="12.9" x2="7.2" y2="12.9" />
                </svg>
                {submittedTooltip && (
                  <div
                    id="mobile-submitted-book-tooltip"
                    data-testid="submitted-book-tooltip"
                    role="tooltip"
                    style={{
                      position: 'absolute',
                      top: 'calc(100% + 4px)',
                      left: 0,
                      background: 'var(--text)',
                      color: 'var(--bg)',
                      fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                      fontSize: '0.65rem',
                      lineHeight: 1.3,
                      padding: '0.3rem 0.5rem',
                      width: 'max-content',
                      maxWidth: 'min(18rem, calc(100vw - 2rem))',
                      pointerEvents: 'none',
                      zIndex: 10,
                    }}
                  >
                    {SUBMITTED_BY_MEMBER_LABEL}
                  </div>
                )}
              </div>
            )}
            {/* Счётчик — прижат вправо */}
            {!!book.signupCount && (
              <span style={{ marginLeft: 'auto', position: 'relative', display: 'inline-flex' }}>
                <span
                  onMouseEnter={() => setSignupTooltip(true)}
                  onMouseLeave={() => setSignupTooltip(false)}
                  onClick={() => setSignupTooltip(v => !v)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                    fontSize: 10.5,
                    color: 'var(--text-muted)',
                    whiteSpace: 'nowrap',
                    cursor: 'default',
                    userSelect: 'none',
                  }}
                >
                  <svg viewBox="0 0 9 11" width="9" height="11" aria-hidden="true" style={{ flexShrink: 0 }}>
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
                      background: 'var(--text)',
                      color: 'var(--bg)',
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
              </span>
            )}
          </div>

          {/* Название */}
          <h2
            style={{
              fontFamily: 'var(--nd-serif), Georgia, serif',
              fontWeight: 700,
              fontSize: 16.5,
              lineHeight: 1.2,
              letterSpacing: '-0.01em',
              color: isRead ? 'var(--text-secondary)' : 'var(--text)',
              margin: 0,
            }}
          >
            {book.name}
          </h2>

          {/* Автор + мета */}
          <p style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontStyle: 'italic', fontSize: 12, color: 'var(--text-secondary)', margin: '4px 0 0', lineHeight: 1.4 }}>
            {book.author}
            <span style={{ fontStyle: 'normal', color: 'var(--text-muted)' }}>
              {year ? ` · ${year}` : ''}
              {book.pages ? ` · ${book.pages} стр.` : ''}
            </span>
          </p>
        </div>
      </div>

      {/* Описание — герой */}
      {book.description && (
        <>
          <p
            onClick={isLongDescription ? () => setDescExpanded(v => !v) : undefined}
            style={{
              fontFamily: 'var(--nd-sans), system-ui, sans-serif',
              fontSize: 12.5,
              lineHeight: 1.6,
              color: isRead ? 'var(--text-secondary)' : 'var(--text-body)',
              marginTop: 13,
              marginBottom: 0,
              whiteSpace: 'pre-line',
              cursor: isLongDescription ? 'pointer' : 'default',
              ...(descExpanded ? {} : {
                display: '-webkit-box',
                WebkitLineClamp: 6,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }),
            }}
          >
            {book.description}
          </p>
          {isLongDescription && (
            <button
              onClick={() => setDescExpanded(v => !v)}
              style={{
                background: 'none',
                border: 'none',
                padding: '5px 0 0',
                fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                fontSize: 10.5,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                color: 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              {descExpanded ? 'Свернуть' : 'Читать далее'}
            </button>
          )}
        </>
      )}

      {/* Выноска «Почему предлагаю прочитать» */}
      {book.whyRead && !isRead && (
        <div
          style={{
            marginTop: 11,
            borderLeft: '2px solid var(--accent)',
            background: '#FDF6F3',
            padding: '0.6rem 0.75rem',
          }}
        >
          <p
            style={{
              fontFamily: 'var(--nd-sans), system-ui, sans-serif',
              fontSize: 8.5,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              color: 'var(--accent)',
              margin: '0 0 0.3rem',
            }}
          >
            Почему предлагаю прочитать
          </p>
          <p
            style={{
              fontFamily: 'var(--nd-sans), system-ui, sans-serif',
              fontStyle: 'italic',
              fontSize: 11.5,
              lineHeight: 1.5,
              color: 'var(--text-secondary)',
              margin: 0,
              whiteSpace: 'pre-line',
            }}
          >
            {book.whyRead}
          </p>
        </div>
      )}

      {/* Рекомендация */}
      {book.recommendationLink && (() => {
        const parsed = parseRecommendationLink(book.recommendationLink)
        if (!parsed) return null
        return (
          <p style={{ margin: '0.5rem 0 0', fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
            {'Ещё рекомендации: '}
            <a
              href={parsed.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'var(--text-muted)', borderBottom: '1px solid var(--border)', textDecoration: 'none' }}
            >
              {parsed.text}
            </a>
          </p>
        )
      })()}

      {/* Действия */}
      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginTop: 14 }}>
        <span style={{ flex: 1 }}>
          {personalStatus === 'reading' || personalStatus === 'read' ? (
            <div
              style={{
                width: '100%',
                padding: '8px 12px',
                fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                fontSize: 10.5,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                border: '1px solid #D0D0D0',
                color: 'var(--text-muted)',
                textAlign: 'center',
                boxSizing: 'border-box',
              }}
            >
              {personalStatus === 'reading' ? 'Читаю сейчас' : 'Прочитал:а'}
            </div>
          ) : (
            <button
              onClick={() => onToggle(book)}
              aria-pressed={isSelected}
              style={{
                width: '100%',
                padding: '8px 12px',
                fontFamily: 'var(--nd-sans), system-ui, sans-serif',
                fontSize: 10.5,
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                cursor: 'pointer',
                border: '1px solid var(--border-strong)',
                background: isSelected ? '#111' : 'transparent',
                color: isSelected ? '#fff' : '#111',
                boxSizing: 'border-box',
                transition: 'background .15s, color .15s',
              }}
            >
              {isSelected ? '✓ Вы записаны' : 'Хочу читать'}
            </button>
          )}
        </span>
        {book.link && (
          <a
            href={book.link}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              fontFamily: 'var(--nd-sans), system-ui, sans-serif',
              fontSize: 10.5,
              color: isRead ? 'var(--text-muted)' : 'var(--text)',
              borderBottom: isRead ? '1px solid #C8C0B2' : '1px solid var(--border-strong)',
              whiteSpace: 'nowrap',
              textDecoration: 'none',
            }}
          >
            читать ↗
          </a>
        )}
      </div>
    </div>
  )
}
