'use client'

import { useState } from 'react'
import type { MyMoveBook } from '@/lib/matching/my-moves'
import CoverImage from './CoverImage'
import MatchingBookDetailModal from './MatchingBookDetailModal'
import { getPseudonymColor } from './matching-shared'

interface Props {
  moves: MyMoveBook[]
  frozen?: boolean
}

export default function MatchingMyMoves({ moves: initialMoves, frozen = false }: Props) {
  const [moves, setMoves] = useState(initialMoves)
  const [adding, setAdding] = useState<string | null>(null)
  const [modalBook, setModalBook] = useState<MyMoveBook | null>(null)

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

  return (
    <>
      {modalBook && (
        <MatchingBookDetailModal
          book={{ ...modalBook, isInList: false, personalStatus: null }}
          chips={modalBook.existingParticipants.map((p) => ({
            ...p,
            bookId: modalBook.bookId,
            rank: null,
            personalStatus: null,
          }))}
          onClose={() => setModalBook(null)}
        />
      )}
      <p className="text-xs m-0 mb-2" style={{ color: 'var(--text-muted)' }}>
        Добавь книгу и круг замкнется
      </p>
      {moves.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center h-full p-6 text-center"
          style={{ color: 'var(--text-muted)' }}
        >
          <div className="text-3xl mb-2">✅</div>
          <p className="text-sm">Пока нет книг, где ваша заявка замкнет круг</p>
        </div>
      ) : (
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
                  <button
                    type="button"
                    onClick={() => setModalBook(move)}
                    className="font-semibold text-sm leading-snug mb-0.5 text-left hover:underline"
                    style={{ color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block', maxWidth: '100%' }}
                  >
                    {move.title}
                  </button>
                  <div className="text-xs mb-1.5" style={{ color: 'var(--text-muted)' }}>
                    {move.author}
                  </div>
                  <div className="text-[11px] font-medium mb-1" style={{ color: 'var(--text-muted)' }}>
                    Уже записались:
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {move.existingParticipants.map((p) => (
                      <span
                        key={p.pseudonym}
                        className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] ${getPseudonymColor(p.pseudonym).chip}`}
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
      )}
    </>
  )
}
