'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { MyMoveBook } from '@/lib/matching/my-moves'
import { impactCoverageGain, impactStrongInterestGain } from '@/lib/matching/move-impact'
import CoverImage from './CoverImage'
import MatchingBookDetailModal, { type MatchingBookDetail } from './MatchingBookDetailModal'
import type { BookParticipant } from './MatchingPersonalList'

interface Props {
  moves: MyMoveBook[]
  frozen?: boolean
  viewingUserId: string
  mutationUserId?: string
  onBeneficiaryHover?: (ids: Set<string>) => void
}

interface ModalState {
  book: MatchingBookDetail
  chips: BookParticipant[]
}

export default function MatchingMyMoves({
  moves: initialMoves,
  frozen = false,
  viewingUserId,
  mutationUserId,
  onBeneficiaryHover,
}: Props) {
  const router = useRouter()
  const [moves, setMoves] = useState(initialMoves)
  const [adding, setAdding] = useState<string | null>(null)
  const [modalState, setModalState] = useState<ModalState | null>(null)

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

  function openBook(book: MatchingBookDetail, chips: BookParticipant[]) {
    setModalState({ book, chips })
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
          <p className="text-sm">Пока нет книг, где твоя заявка изменит лучший сценарий</p>
        </div>
      ) : (
        <ul className="list-none p-0 m-0">
          {moves.map((move, idx) => {
            const beneficiaryIds = new Set(move.impact?.beneficiaries.map((b) => b.userId) ?? [])
            const coverageGain = impactCoverageGain(move)
            return (
            <li
              key={move.bookId}
              className={`nd-move-item nd-move-redesign ${idx === 0 ? 'nd-move-top' : ''}`}
              style={{
                padding: '0.95rem 1.05rem',
                borderTop: idx === 0 ? 'none' : '1px solid var(--hair)',
              }}
              onMouseEnter={() => onBeneficiaryHover?.(beneficiaryIds)}
              onMouseLeave={() => onBeneficiaryHover?.(new Set())}
              onFocus={() => onBeneficiaryHover?.(beneficiaryIds)}
              onBlur={() => onBeneficiaryHover?.(new Set())}
            >
              <div className="nd-move-impact-head">
                <span className="nd-move-rank-pill">
                  <span className="nd-move-rank-number">{idx + 1}</span>
                  <span>{idx === 0 ? 'Лучший ход' : 'Ход'}</span>
                </span>
                {move.impact && <ImpactMetricPills move={move} />}
              </div>

              {move.impact && (
                <p className="nd-move-why">
                  <MoveWhyText move={move} />
                </p>
              )}

              <div className="nd-move-book-row">
                <div className="relative overflow-hidden shrink-0 nd-move-book-cover">
                  <CoverImage coverUrl={move.coverUrl} title={move.title} author={move.author} />
                </div>
                <div className="min-w-0">
                  <div className="nd-move-book-kicker">Добавишь</div>
                  <button
                    type="button"
                    onClick={() => openBook(
                      { ...move, isInList: false, personalStatus: null },
                      move.existingParticipants.map((p) => ({
                        ...p,
                        bookId: move.bookId,
                        personalStatus: null,
                      })),
                    )}
                    className="nd-move-book-title"
                  >
                    {move.title}
                  </button>
                  <div className="nd-move-book-author">{move.author}</div>
                </div>
              </div>

              {move.impact && move.impact.beneficiaries.length > 0 && (
                <div className="nd-move-beneficiaries">
                  <div className="nd-move-beneficiaries-label">Кому это поможет</div>
                  {move.impact.beneficiaries.map((beneficiary) => (
                    <div className="nd-move-beneficiary-row" key={beneficiary.userId}>
                      <span className="nd-move-beneficiary-name">{beneficiary.pseudonym}</span>
                      <span className="nd-move-beneficiary-flow">
                        <span className="nd-move-beneficiary-before">{formatBefore(beneficiary.before)}</span>
                        <span className="nd-move-beneficiary-arrow">→</span>
                        <span className={`nd-move-beneficiary-after ${interestClassName(beneficiary.after)}`}>
                          {beneficiary.after}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="nd-move-footer">
                <span className="nd-move-footer-note">
                  {idx === 0 && coverageGain > 0 ? 'Без тебя их не собрать' : '\u00A0'}
                </span>
                {!frozen && (
                  <button
                    className="nd-move-cta"
                    onClick={() => handleAdd(move.bookId)}
                    title="Книга встанет на первое место в твоём списке"
                    disabled={adding === move.bookId}
                  >
                    {adding === move.bookId ? '…' : 'Хочу читать'}
                  </button>
                )}
              </div>
            </li>
          )})}
        </ul>
      )}
    </>
  )
}

function ImpactMetricPills({ move }: { move: MyMoveBook }) {
  const coverageGain = impactCoverageGain(move)
  const strongInterestGain = impactStrongInterestGain(move)

  return (
    <div className="nd-move-metrics">
      {coverageGain > 0 ? (
        <span className="nd-move-metric nd-move-metric-gain">↑ Покрытие {move.impact!.coverage.before}→{move.impact!.coverage.after}</span>
      ) : (
        <span className="nd-move-metric nd-move-metric-keep">Покрытие сохранится</span>
      )}
      {strongInterestGain > 0 ? (
        <span className="nd-move-metric nd-move-metric-gain">↑ +{strongInterestGain} «очень хочу»</span>
      ) : null}
    </div>
  )
}

function MoveWhyText({ move }: { move: MyMoveBook }) {
  const beneficiaries = move.impact?.beneficiaries ?? []
  const leftOut = beneficiaries.filter((b) => b.before.place === 'leftOut')
  const upgraded = beneficiaries.filter((b) => b.before.place === 'circle')
  const strong = beneficiaries.filter((b) => b.after === 'очень хочу')

  if (leftOut.length > 0) {
    return (
      <>
        {renderNames(leftOut.map((b) => b.pseudonym))}
        {' сейчас за бортом. Добавишь эту книгу — и вы соберетесь в круг'}
        {strong.length > 0 && (
          <>
            {', где '}
            <em>{joinNamesText(strong.map((b) => b.pseudonym))} очень хотят читать</em>
          </>
        )}
        {'.'}
      </>
    )
  }

  if (upgraded.length > 0) {
    return (
      <>
        {renderNames(upgraded.map((b) => b.pseudonym))}
        {' уже в сценарии, но эту книгу хотят '}
        <em>сильнее</em>
        {'. Добавишь — соберутся вокруг неё, не потеряв покрытие.'}
      </>
    )
  }

  return (
    <>
      {'Этот ход увеличит покрытие лучшего сценария.'}
    </>
  )
}

function renderNames(names: string[]) {
  const normalized = names.length > 0 ? names : ['Участники']

  return (
    <>
      {normalized.map((name, index) => (
        <span key={`${name}-${index}`}>
          {index > 0 && (index === normalized.length - 1 ? ' и ' : ', ')}
          <b>{name}</b>
        </span>
      ))}
    </>
  )
}

function joinNamesText(names: string[]): string {
  if (names.length === 0) return 'Участники'
  if (names.length === 1) return names[0]
  return `${names.slice(0, -1).join(', ')} и ${names[names.length - 1]}`
}

function formatBefore(before: NonNullable<MyMoveBook['impact']>['beneficiaries'][number]['before']): string {
  if (before.place === 'leftOut') return 'за бортом'
  return `«${before.bookTitle}» · ${before.interest}`
}

function interestClassName(interest: string): string {
  if (interest === 'очень хочу') return 'nd-move-interest-strong'
  if (interest === 'хочу') return 'nd-move-interest-want'
  return 'nd-move-interest-cover'
}
