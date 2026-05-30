'use client'

import { useState } from 'react'
import type { MyMoveBook } from '@/lib/matching/my-moves'
import CoverImage from './CoverImage'

interface Props {
  moves: MyMoveBook[]
  frozen?: boolean
}

const PSEUDONYM_COLORS = [
  'bg-[#fde8d8] text-[#7c3516]',
  'bg-[#dcfce7] text-[#14532d]',
  'bg-[#dbeafe] text-[#1e3a8a]',
  'bg-[#fef9c3] text-[#713f12]',
  'bg-[#f3e8ff] text-[#581c87]',
  'bg-[#ffe4e6] text-[#881337]',
  'bg-[#d1fae5] text-[#065f46]',
  'bg-[#e0f2fe] text-[#075985]',
]

function pseudonymColor(pseudonym: string) {
  let hash = 0
  for (let i = 0; i < pseudonym.length; i++) hash = pseudonym.charCodeAt(i) + ((hash << 5) - hash)
  return PSEUDONYM_COLORS[Math.abs(hash) % PSEUDONYM_COLORS.length]
}

export default function MatchingMyMoves({ moves: initialMoves, frozen = false }: Props) {
  const [moves, setMoves] = useState(initialMoves)
  const [adding, setAdding] = useState<string | null>(null)

  async function handleAdd(bookId: string) {
    if (frozen) return
    setAdding(bookId)
    try {
      const res = await fetch('/api/matching/books', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bookId }),
      })
      if (res.ok) {
        setMoves((prev) => prev.filter((m) => m.bookId !== bookId))
      }
    } finally {
      setAdding(null)
    }
  }

  if (moves.length === 0) {
    return (
      <div
        className="flex flex-col items-center justify-center h-full p-6 text-center"
        style={{ color: 'var(--text-muted)' }}
      >
        <div className="text-3xl mb-2">✅</div>
        <p className="text-sm">Нет книг, где ваш сигнап завершит группу.</p>
      </div>
    )
  }

  return (
    <ul className="list-none p-0 m-0 flex flex-col gap-2.5">
      {moves.map((move) => (
        <li
          key={move.bookId}
          className="rounded-xl border p-3"
          style={{
            borderColor: 'var(--success)',
            background: 'var(--bg-tag-green)',
          }}
        >
          <div className="flex gap-3 mb-2.5">
            <div className="relative rounded overflow-hidden shrink-0" style={{ width: 40, height: 56 }}>
              <CoverImage coverUrl={move.coverUrl} title={move.title} author={move.author} />
            </div>
            <div className="min-w-0 flex-1">
              <div
                className="font-semibold text-sm leading-snug mb-0.5"
                style={{ color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
              >
                {move.title}
              </div>
              <div className="text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>
                {move.author}
              </div>
              <div className="flex flex-wrap gap-1">
                {move.existingParticipants.map((p) => (
                  <span
                    key={p.pseudonym}
                    className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ${pseudonymColor(p.pseudonym)}`}
                  >
                    {p.pseudonym}
                  </span>
                ))}
              </div>
            </div>
          </div>
          {!frozen && (
            <button
              onClick={() => handleAdd(move.bookId)}
              disabled={adding === move.bookId}
              className="w-full text-sm py-2 px-3 rounded-lg border transition-colors font-medium"
              style={
                adding === move.bookId
                  ? {
                      background: 'var(--bg-elevated)',
                      borderColor: 'var(--border)',
                      color: 'var(--text-muted)',
                      cursor: 'default',
                    }
                  : {
                      background: 'var(--success)',
                      borderColor: 'var(--success)',
                      color: '#fff',
                      cursor: 'pointer',
                    }
              }
            >
              {adding === move.bookId ? '…' : 'Хочу читать'}
            </button>
          )}
        </li>
      ))}
    </ul>
  )
}
