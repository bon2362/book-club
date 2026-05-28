'use client'

import { useState } from 'react'
import type { MyMoveBook } from '@/lib/matching/my-moves'
import CoverImage from './CoverImage'

interface Props {
  moves: MyMoveBook[]
}

export default function MatchingMyMoves({ moves: initialMoves }: Props) {
  const [moves, setMoves] = useState(initialMoves)
  const [adding, setAdding] = useState<string | null>(null)

  async function handleAdd(bookId: string) {
    setAdding(bookId)
    try {
      const res = await fetch('/api/matching/books', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bookId }),
      })
      if (res.ok) {
        setMoves(prev => prev.filter(m => m.bookId !== bookId))
      }
    } finally {
      setAdding(null)
    }
  }

  if (moves.length === 0) {
    return (
      <p style={{ color: '#999', fontSize: '0.8rem' }}>
        Нет книг, где ваш сигнап завершит группу.
      </p>
    )
  }

  return (
    <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
      {moves.map(move => (
        <li
          key={move.bookId}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
            padding: '0.6rem 0.75rem',
            borderRadius: 5,
            background: '#fafff8',
            border: '1px solid #d4ecd4',
          }}
        >
          <div style={{ width: 36, height: 52, flexShrink: 0 }}>
            <CoverImage coverUrl={move.coverUrl} title={move.title} author={move.author} />
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
              {move.title}
            </div>
            <div style={{ fontSize: '0.7rem', color: '#888', marginTop: '0.15rem' }}>
              Уже записаны: {move.existingParticipants.map(p => p.pseudonym).join(', ')}
            </div>
          </div>
          <button
            onClick={() => handleAdd(move.bookId)}
            disabled={adding === move.bookId}
            style={{
              fontFamily: 'var(--nd-mono), monospace',
              fontSize: '0.72rem',
              padding: '4px 10px',
              borderRadius: 3,
              border: '1px solid #4a7',
              background: adding === move.bookId ? '#eee' : '#f0faf0',
              color: adding === move.bookId ? '#999' : '#4a7',
              cursor: adding === move.bookId ? 'default' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {adding === move.bookId ? '…' : 'Хочу читать'}
          </button>
        </li>
      ))}
    </ul>
  )
}
