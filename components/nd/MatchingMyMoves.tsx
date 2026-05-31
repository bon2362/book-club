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
      {moves.length === 0 ? (
        <div
          className="flex flex-col items-center justify-center h-full p-6 text-center"
          style={{ color: 'var(--text-muted)' }}
        >
          <div className="text-3xl mb-2">✅</div>
          <p className="text-sm">Пока нет книг, где ваша заявка замкнет круг</p>
        </div>
      ) : (
        <ul className="list-none p-0 m-0">
          {moves.map((move, idx) => (
            <li
              key={move.bookId}
              onMouseEnter={() => setHoveredCard(move.bookId)}
              onMouseLeave={() => setHoveredCard(null)}
              onFocus={() => setHoveredCard(move.bookId)}
              onBlur={() => setHoveredCard(null)}
              style={{
                padding: '0.95rem 1.25rem',
                borderTop: idx === 0 ? 'none' : '1px solid var(--hair)',
              }}
            >
              <div className="flex gap-3">
                <div
                  className="relative overflow-hidden shrink-0"
                  style={{ width: 42, height: 60, borderRadius: 4, boxShadow: '0 1px 3px rgba(40,30,20,0.14)' }}
                >
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
                    className="text-left"
                    style={{
                      fontFamily: 'var(--nd-serif)',
                      fontWeight: 700,
                      fontSize: '1rem',
                      letterSpacing: '-0.01em',
                      color: 'var(--text)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      display: 'block',
                      maxWidth: '100%',
                      lineHeight: 1.25,
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                    }}
                    onMouseEnter={(e) => { (e.target as HTMLElement).style.color = 'var(--accent)' }}
                    onMouseLeave={(e) => { (e.target as HTMLElement).style.color = 'var(--text)' }}
                  >
                    {move.title}
                  </button>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.1rem' }}>
                    {move.author}
                  </div>

                  {move.existingParticipants.length > 0 && (
                    <>
                      <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', margin: '0.55rem 0 0.25rem' }}>
                        Уже записались
                      </div>
                      <div className="flex flex-wrap" style={{ gap: '0.3rem 0' }}>
                        {move.existingParticipants.map((p) => (
                          <ParticipantInterestChip
                            key={p.userId}
                            userId={p.userId}
                            pseudonym={p.pseudonym}
                            rank={p.rank}
                          />
                        ))}
                      </div>
                    </>
                  )}

                  {move.impact && hoveredCard === move.bookId && (
                    <div
                      style={{
                        marginTop: '0.6rem',
                        paddingLeft: '0.75rem',
                        borderLeft: '2px solid var(--accent)',
                        fontSize: '0.72rem',
                        lineHeight: 1.45,
                        color: 'var(--text-secondary)',
                      }}
                    >
                      <div style={{ fontWeight: 600, color: 'var(--text)', marginBottom: '0.1rem' }}>
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
                              style={{
                                color: 'var(--text)',
                                textDecoration: 'underline',
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

                  {!frozen && (
                    <button
                      onClick={() => handleAdd(move.bookId)}
                      disabled={adding === move.bookId}
                      style={
                        adding === move.bookId
                          ? {
                              marginTop: '0.7rem',
                              background: 'var(--border)',
                              border: 'none',
                              color: 'var(--text-muted)',
                              cursor: 'default',
                              fontSize: '0.82rem',
                              fontWeight: 600,
                              padding: '0.5rem 1rem',
                              borderRadius: 'var(--radius-control)',
                            }
                          : {
                              marginTop: '0.7rem',
                              background: 'var(--accent)',
                              border: 'none',
                              color: 'var(--bg-input)',
                              cursor: 'pointer',
                              fontSize: '0.82rem',
                              fontWeight: 600,
                              padding: '0.5rem 1rem',
                              borderRadius: 'var(--radius-control)',
                            }
                      }
                    >
                      {adding === move.bookId ? '…' : 'Хочу читать'}
                    </button>
                  )}
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  )
}
