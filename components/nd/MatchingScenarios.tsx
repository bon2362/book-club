'use client'

import { useState, useEffect, useCallback } from 'react'
import type { ScenarioCard } from '@/lib/matching/scenarios'
import CoverImage from './CoverImage'

interface BookInfo {
  id: string
  title: string
  author: string
  coverUrl: string | null
}

interface Props {
  scenarios: ScenarioCard[]
  bookById: Map<string, BookInfo>
}

const tierStyle = (tier: ScenarioCard['tier']): React.CSSProperties => {
  if (tier === 'leader') return { background: '#f0faf0', border: '1px solid #b2d8b2' }
  if (tier === 'max-coverage') return { background: '#f5f8ff', border: '1px solid #c0cff0' }
  return { background: '#fafaf8', border: '1px solid #e8e8e4' }
}

const tierLabel = (tier: ScenarioCard['tier']): string | null => {
  if (tier === 'leader') return 'лидер'
  if (tier === 'max-coverage') return 'макс. покрытие'
  return null
}

const tierLabelColor = (tier: ScenarioCard['tier']): string => {
  if (tier === 'leader') return '#4a7'
  return '#6699cc'
}

const interestChipStyle = (interest: string): React.CSSProperties => {
  if (interest === 'хочу читать') return { background: '#e8f5e8', color: '#4a7', border: '1px solid #b2d8b2' }
  if (interest === 'готов(а)') return { background: '#f0f0f0', color: '#888', border: '1px solid #ddd' }
  return { background: '#f9f9f9', color: '#bbb', border: '1px solid #eee' }
}

interface BookModalProps {
  book: BookInfo
  onClose: () => void
}

function BookModal({ book, onClose }: BookModalProps) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      role="presentation"
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.35)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 1000,
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={book.title}
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: 6, padding: '1.5rem',
          maxWidth: 380, width: '90%', fontFamily: 'var(--nd-mono), monospace',
          boxShadow: '0 4px 24px rgba(0,0,0,0.12)',
        }}
      >
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '1rem' }}>
          <div style={{ width: 56, height: 80, flexShrink: 0 }}>
            <CoverImage coverUrl={book.coverUrl} title={book.title} author={book.author} />
          </div>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.9rem', marginBottom: '0.25rem' }}>{book.title}</div>
            <div style={{ fontSize: '0.78rem', color: '#666' }}>{book.author}</div>
          </div>
        </div>
        <button
          onClick={onClose}
          style={{
            marginTop: '0.5rem', fontSize: '0.78rem', color: '#999',
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          }}
        >
          Закрыть (Esc)
        </button>
      </div>
    </div>
  )
}

export default function MatchingScenarios({ scenarios, bookById }: Props) {
  const [modalBook, setModalBook] = useState<BookInfo | null>(null)
  const openModal = useCallback((book: BookInfo) => setModalBook(book), [])
  const closeModal = useCallback(() => setModalBook(null), [])

  if (scenarios.length === 0) {
    return (
      <p style={{ color: '#999', fontSize: '0.8rem' }}>
        Недостаточно участников или сигнапов для формирования сценариев.
      </p>
    )
  }

  return (
    <>
      {modalBook && <BookModal book={modalBook} onClose={closeModal} />}
      <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {scenarios.map((card) => {
          const book = bookById.get(card.bookId)
          const label = tierLabel(card.tier)
          return (
            <li
              key={card.bookId}
              style={{
                borderRadius: 5,
                padding: '0.75rem',
                ...tierStyle(card.tier),
              }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                {book && (
                  <div style={{ width: 36, height: 52, flexShrink: 0 }}>
                    <CoverImage coverUrl={book.coverUrl} title={book.title} author={book.author} />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.3rem' }}>
                    <button
                      onClick={() => book && openModal(book)}
                      style={{
                        background: 'none', border: 'none', padding: 0,
                        fontFamily: 'var(--nd-mono), monospace',
                        fontSize: '0.82rem', fontWeight: 600,
                        cursor: book ? 'pointer' : 'default',
                        textAlign: 'left',
                        textDecoration: book ? 'underline' : 'none',
                        color: '#222',
                      }}
                    >
                      {book?.title ?? card.bookId}
                    </button>
                    {label && (
                      <span
                        style={{
                          fontSize: '0.65rem',
                          color: tierLabelColor(card.tier),
                          border: `1px solid ${tierLabelColor(card.tier)}`,
                          borderRadius: 3,
                          padding: '1px 5px',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {label}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
                    {card.members.map(m => (
                      <span
                        key={m.userId}
                        style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}
                      >
                        <span style={{ fontSize: '0.78rem', color: '#555' }}>{m.pseudonym}</span>
                        <span
                          style={{
                            fontSize: '0.6rem',
                            padding: '1px 4px',
                            borderRadius: 3,
                            ...interestChipStyle(m.interest),
                          }}
                        >
                          {m.interest}
                        </span>
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </li>
          )
        })}
      </ul>
    </>
  )
}
