'use client'

import type { PersonalListBook } from '@/lib/matching/personal-list'
import CoverImage from './CoverImage'

interface Props {
  books: PersonalListBook[]
}

const interestLabel = (rank: number | null, readingStatus: string | null): string => {
  if (readingStatus === 'reading') return 'читается'
  if (rank === null) return 'без ранга'
  if (rank <= 3) return 'хочу читать'
  return 'готов(а)'
}

const labelColor = (rank: number | null, readingStatus: string | null): string => {
  if (readingStatus === 'reading') return '#888'
  if (rank === null) return '#bbb'
  if (rank <= 3) return '#4a7'
  return '#999'
}

export default function MatchingPersonalList({ books }: Props) {
  if (books.length === 0) {
    return (
      <p style={{ color: '#999', fontSize: '0.8rem' }}>
        Вы ещё не добавили книги. Перейдите в каталог, чтобы выбрать книги для чтения.
      </p>
    )
  }

  return (
    <ul
      style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.5rem' }}
      data-testid="matching-personal-list"
    >
      {books.map((book) => (
        <li
          key={book.bookId}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.4rem 0',
            borderBottom: '1px solid #f0f0f0',
            opacity: book.readingStatus === 'reading' ? 0.7 : 1,
          }}
        >
          <span
            style={{
              fontFamily: 'var(--nd-mono), monospace',
              fontSize: '0.7rem',
              color: '#bbb',
              minWidth: 18,
              textAlign: 'right',
            }}
          >
            {book.rank ?? '—'}
          </span>

          <div style={{ width: 32, height: 32, flexShrink: 0 }}>
            <CoverImage
              coverUrl={book.coverUrl}
              title={book.title}
              author={book.author}
            />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div
              style={{
                fontFamily: 'var(--nd-mono), monospace',
                fontSize: '0.82rem',
                fontWeight: 500,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}
            >
              {book.title}
            </div>
            <div style={{ fontSize: '0.72rem', color: '#999' }}>{book.author}</div>
          </div>

          <span
            style={{
              fontFamily: 'var(--nd-mono), monospace',
              fontSize: '0.68rem',
              color: labelColor(book.rank, book.readingStatus),
              whiteSpace: 'nowrap',
            }}
          >
            {interestLabel(book.rank, book.readingStatus)}
          </span>
        </li>
      ))}
    </ul>
  )
}
