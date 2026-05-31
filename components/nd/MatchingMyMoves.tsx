'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { MyMoveBook } from '@/lib/matching/my-moves'
import CoverImage from './CoverImage'
import MatchingBookDetailModal, { type MatchingBookDetail } from './MatchingBookDetailModal'
import ParticipantInterestChip from './ParticipantInterestChip'
import type { BookParticipant } from './MatchingPersonalList'

interface BookInfo extends MatchingBookDetail {
  id: string
}

interface Props {
  moves: MyMoveBook[]
  frozen?: boolean
  bookById: Map<string, BookInfo>
  bookParticipants: BookParticipant[]
  viewingUserId: string
  mutationUserId?: string
}

interface ModalState {
  book: MatchingBookDetail
  chips: BookParticipant[]
}

export default function MatchingMyMoves({
  moves: initialMoves,
  frozen = false,
  bookById,
  bookParticipants,
  viewingUserId,
  mutationUserId,
}: Props) {
  const router = useRouter()
  const [moves, setMoves] = useState(initialMoves)
  const [adding, setAdding] = useState<string | null>(null)
  const [modalState, setModalState] = useState<ModalState | null>(null)
  const [hoveredCard, setHoveredCard] = useState<string | null>(null)
  const [hoveredButton, setHoveredButton] = useState<string | null>(null)

  useEffect(() => {
    setMoves(initialMoves)
    setModalState(null)
  }, [initialMoves])

  async function handleAdd(bookId: string) {
    if (frozen) return
    setAdding(bookId)
    try {
      const url = mutationUserId
        ? `/api/matching/books?as=${encodeURIComponent(mutationUserId)}`
        : '/api/matching/books'
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ bookId }),
      })
      if (res.ok) {
        setMoves((prev) => prev.filter((m) => m.bookId !== bookId))
        router.refresh()
      }
    } finally {
      setAdding(null)
    }
  }

  return (
    <>
      {modalState && (
        <MatchingBookDetailModal
          book={modalState.book}
          chips={modalState.chips}
          viewingUserId={viewingUserId}
          onClose={() => setModalState(null)}
        />
      )}
      <p className="text-xs m-0 mb-2" style={{ color: 'var(--text-muted)' }}>
        Добавь книгу и соберется новый сценарий
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
              className="p-3"
              onMouseEnter={() => setHoveredCard(move.bookId)}
              onMouseLeave={() => setHoveredCard(null)}
              onFocus={() => setHoveredCard(move.bookId)}
              onBlur={() => setHoveredCard(null)}
              style={{
                borderRadius: 0,
                border: '1px solid var(--border)',
                borderLeft: '2px solid var(--accent)',
                background: 'var(--bg-input)',
              }}
            >
              <div className="flex gap-3 mb-2.5">
                <div className="relative overflow-hidden shrink-0" style={{ width: 40, height: 56, borderRadius: 0 }}>
                  <CoverImage coverUrl={move.coverUrl} title={move.title} author={move.author} />
                </div>
                <div className="min-w-0 flex-1">
                  <button
                    type="button"
                    onClick={() => setModalState({
                      book: { ...move, isInList: false, personalStatus: null },
                      chips: move.existingParticipants.map((p) => ({
                        ...p,
                        bookId: move.bookId,
                        personalStatus: null,
                      })),
                    })}
                    className="text-left hover:underline"
                    style={{
                      fontFamily: 'Georgia, "Times New Roman", serif',
                      fontWeight: 700,
                      fontSize: '0.9rem',
                      letterSpacing: '-0.01em',
                      color: 'var(--text)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      display: 'block',
                      maxWidth: '100%',
                      marginBottom: '0.15rem',
                    }}
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
                      <ParticipantInterestChip
                        key={p.userId}
                        userId={p.userId}
                        pseudonym={p.pseudonym}
                        rank={p.rank}
                      />
                    ))}
                  </div>
                  {move.impact && (
                    <div
                      className="mt-2 border-l-2 pl-2 text-[11px] leading-snug"
                      style={{
                        borderColor: 'var(--accent)',
                        color: 'var(--text-secondary)',
                        display: hoveredCard === move.bookId ? 'block' : 'none',
                      }}
                    >
                      <div className="font-semibold" style={{ color: 'var(--text)' }}>
                        После добавления
                      </div>
                      <div>
                        Лучшим сценарием станет:{' '}
                        {move.impact.circleBooks.map((book, index) => (
                          <span key={book.bookId}>
                            {index > 0 && ' + '}
                            <button
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation()
                                const detailed = bookById.get(book.bookId)
                                if (detailed) {
                                  setModalState({
                                    book: detailed,
                                    chips: bookParticipants.filter((p) => p.bookId === book.bookId),
                                  })
                                }
                              }}
                              className="underline"
                              style={{
                                color: 'var(--text)',
                                font: 'inherit',
                                background: 'none',
                                border: 'none',
                                padding: 0,
                                cursor: 'pointer',
                              }}
                            >
                              {book.title}
                            </button>
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              {!frozen && (
                <button
                  onClick={() => handleAdd(move.bookId)}
                  onMouseEnter={() => setHoveredButton(move.bookId)}
                  onMouseLeave={() => setHoveredButton(null)}
                  onFocus={() => setHoveredButton(move.bookId)}
                  onBlur={() => setHoveredButton(null)}
                  disabled={adding === move.bookId}
                  className="w-full font-semibold"
                  style={
                    adding === move.bookId
                      ? {
                          borderRadius: 0,
                          background: 'var(--border)',
                          border: '1px solid var(--border)',
                          color: 'var(--text-muted)',
                          cursor: 'default',
                          fontSize: '0.72rem',
                          textTransform: 'uppercase' as const,
                          letterSpacing: '0.08em',
                          padding: '0.55rem',
                        }
                      : {
                          borderRadius: 0,
                          background: 'var(--text)',
                          border: '1px solid var(--border-strong)',
                          color: 'var(--bg)',
                          cursor: 'pointer',
                          fontSize: '0.72rem',
                          textTransform: 'uppercase' as const,
                          letterSpacing: '0.08em',
                          padding: '0.55rem',
                        }
                  }
                >
                  {adding === move.bookId
                    ? '…'
                    : hoveredButton === move.bookId
                      ? 'Хочу читать * на первое место'
                      : 'Хочу читать'}
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
