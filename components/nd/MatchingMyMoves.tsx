'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { MyMoveBook } from '@/lib/matching/my-moves'
import type { OptimizationMode } from '@/lib/matching/scenarios'
import { impactCoverageGain, impactStrongInterestGain } from '@/lib/matching/move-impact'
import { declinePseudonym } from '@/lib/matching/pseudonym-declension'
import CoverImage from './CoverImage'
import MatchingBookDetailModal, { type MatchingBookDetail } from './MatchingBookDetailModal'
import type { BookParticipant } from './MatchingPersonalList'
import { useMatchingBoard } from './MatchingBoardProvider'

interface Props {
  moves: MyMoveBook[]
  frozen?: boolean
  viewingUserId: string
  mutationUserId?: string
  onMovePreview?: (move: MyMoveBook | null) => void
  mode?: OptimizationMode
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
  onMovePreview,
  mode = 'coverage',
}: Props) {
  const router = useRouter()
  const { beginPending } = useMatchingBoard()
  const [moves, setMoves] = useState(initialMoves)
  const [adding, setAdding] = useState<string | null>(null)
  const [firstPlaceHint, setFirstPlaceHint] = useState<string | null>(null)
  const [previewedMoveId, setPreviewedMoveId] = useState<string | null>(null)
  const [modalState, setModalState] = useState<ModalState | null>(null)

  useEffect(() => {
    setMoves(initialMoves)
    setFirstPlaceHint(null)
    setPreviewedMoveId(null)
    setModalState(null)
  }, [initialMoves])

  function previewMove(move: MyMoveBook | null) {
    setPreviewedMoveId(move?.bookId ?? null)
    onMovePreview?.(move)
  }

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
        beginPending()
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
          <p className="text-sm">
            {mode === 'satisfaction'
              ? 'Пока нет ходов, которые заметно улучшат совпадение интересов'
              : 'Пока нет книг, где твоя заявка изменит лучший сценарий'}
          </p>
        </div>
      ) : (
        <ul
          className="list-none m-0"
          style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem', padding: '0.6rem 0.75rem 0' }}
        >
          {moves.map((move) => (
            <MoveCard
              key={move.bookId}
              move={move}
              mode={mode}
              frozen={frozen}
              adding={adding}
              firstPlaceHint={firstPlaceHint}
              previewedMoveId={previewedMoveId}
              onOpenBook={openBook}
              onAdd={handleAdd}
              onFirstPlaceHintChange={setFirstPlaceHint}
              onPreview={previewMove}
            />
          ))}
        </ul>
      )}
    </>
  )
}

interface MoveCardProps {
  move: MyMoveBook
  mode: OptimizationMode
  frozen: boolean
  adding: string | null
  firstPlaceHint: string | null
  previewedMoveId: string | null
  onOpenBook: (book: MatchingBookDetail, chips: BookParticipant[]) => void
  onAdd: (bookId: string) => void
  onFirstPlaceHintChange: (action: string | null | ((prev: string | null) => string | null)) => void
  onPreview: (move: MyMoveBook | null) => void
}

function MoveCard({
  move,
  mode,
  frozen,
  adding,
  firstPlaceHint,
  previewedMoveId,
  onOpenBook,
  onAdd,
  onFirstPlaceHintChange,
  onPreview,
}: MoveCardProps) {
  const [bookTitleHovered, setBookTitleHovered] = useState(false)

  function handleOpenBook() {
    onOpenBook(
      { ...move, isInList: false, personalStatus: null },
      move.existingParticipants.map((p) => ({
        ...p,
        bookId: move.bookId,
        personalStatus: null,
      })),
    )
  }

  return (
    <li
      className="nd-move-item nd-move-redesign"
      style={{ padding: '0.95rem 1.05rem' }}
      onMouseEnter={() => onPreview(move)}
      onMouseLeave={() => onPreview(null)}
      onFocus={() => onPreview(move)}
      onBlur={() => onPreview(null)}
    >
      <div className="nd-move-impact-head">
        {move.impact && <ImpactMetricPills move={move} mode={mode} />}
      </div>

      {move.impact && (
        <p className="nd-move-why">
          <MoveWhyText
            move={move}
            mode={mode}
            onThisBookClick={handleOpenBook}
            bookTitleHovered={bookTitleHovered}
            onThisBookHoverChange={setBookTitleHovered}
          />
        </p>
      )}

      <div className="nd-move-book-row">
        <div className="relative overflow-hidden shrink-0 nd-move-book-cover">
          <CoverImage coverUrl={move.coverUrl} title={move.title} author={move.author} />
        </div>
        <div className="min-w-0">
          <button
            type="button"
            onClick={handleOpenBook}
            className="nd-move-book-title"
            style={bookTitleHovered ? { color: 'var(--accent)' } : undefined}
            onMouseEnter={() => setBookTitleHovered(true)}
            onMouseLeave={() => setBookTitleHovered(false)}
          >
            {move.title}
          </button>
          <div className="nd-move-book-author">{move.author}</div>
        </div>
      </div>

      <div className="nd-move-footer">
        <span
          className="nd-move-footer-note"
          style={firstPlaceHint === move.bookId ? { color: 'var(--accent)' } : undefined}
        >
          {firstPlaceHint === move.bookId
            ? 'книга встанет на 1-е место в твоём списке'
            : previewedMoveId === move.bookId ? '← смотри слева, каким станет расклад' : ' '}
        </span>
        {!frozen && (
          <button
            className="nd-move-cta"
            onClick={() => onAdd(move.bookId)}
            onMouseEnter={() => onFirstPlaceHintChange(move.bookId)}
            onMouseLeave={() => onFirstPlaceHintChange((cur) => (cur === move.bookId ? null : cur))}
            onFocus={() => onFirstPlaceHintChange(move.bookId)}
            onBlur={() => onFirstPlaceHintChange((cur) => (cur === move.bookId ? null : cur))}
            disabled={adding === move.bookId}
          >
            {adding === move.bookId ? '…' : 'Хочу читать'}
          </button>
        )}
      </div>
    </li>
  )
}

interface MoveWhyTextProps {
  move: MyMoveBook
  mode: OptimizationMode
  onThisBookClick?: () => void
  bookTitleHovered?: boolean
  onThisBookHoverChange?: (v: boolean) => void
}

function MoveWhyText({
  move,
  mode,
  onThisBookClick,
  bookTitleHovered = false,
  onThisBookHoverChange,
}: MoveWhyTextProps) {
  const beneficiaries = move.impact?.beneficiaries ?? []
  const leftOut = beneficiaries.filter((b) => b.before.place === 'leftOut')
  const upgraded = beneficiaries.filter((b) => b.before.place === 'circle')
  const strong = beneficiaries.filter((b) => b.after === 'очень хочу')
  const strongInterestVerb = strong.length === 1 ? 'хочет' : 'хотят'

  // Кликабельный «эту книгу» — открывает попап книги, подсвечивается синхронно с заголовком
  const thisBook = (
    <button
      type="button"
      onClick={onThisBookClick}
      onMouseEnter={() => onThisBookHoverChange?.(true)}
      onMouseLeave={() => onThisBookHoverChange?.(false)}
      style={{
        fontFamily: 'inherit',
        fontSize: 'inherit',
        fontWeight: 700,
        lineHeight: 'inherit',
        color: bookTitleHovered ? 'var(--accent)' : 'inherit',
        background: 'none',
        border: 'none',
        padding: 0,
        cursor: 'pointer',
      }}
    >
      эту книгу
    </button>
  )

  if (mode === 'satisfaction') {
    const satisfaction = move.impact?.satisfaction
    const viewerJoins = satisfaction?.before === null && satisfaction?.after !== null

    if (viewerJoins && leftOut.length === 0 && upgraded.length === 0) {
      return <>Добавишь — и вы соберётесь в круг, где интересы совпадают лучше.</>
    }

    // Участники с числовым улучшением ранга
    const rankImproved = upgraded.filter(b =>
      b.before.place === 'circle' &&
      b.before.rankBefore !== null && b.afterRank !== null && b.afterRank < b.before.rankBefore
    )

    if (rankImproved.length > 0) {
      return (
        <>
          {rankImproved.map((b, i) => {
            if (b.before.place !== 'circle') return null
            const rBefore = b.before.rankBefore as number
            const rAfter = b.afterRank as number
            return (
              <span key={b.userId}>
                {i > 0 && ' '}
                <b>{b.pseudonym}</b>
                {' ставит '}{thisBook}{` на ${rAfter}-е место, а книгу нынешнего круга — на ${rBefore}-е.`}
              </span>
            )
          })}
          {' '}Соберётесь вокруг неё — расклад станет интереснее.
        </>
      )
    }

    if (leftOut.length > 0) {
      return (
        <>
          {renderNames(leftOut.map((b) => b.pseudonym))}
          {' сейчас без круга — добавишь, и соберётесь вместе.'}
        </>
      )
    }

    return <>Этот ход улучшит расклад — интересы совпадут лучше.</>
  }

  if (leftOut.length > 0) {
    return (
      <>
        {renderNames(leftOut.map((b) => b.pseudonym))}
        {' сейчас за бортом. Добавишь '}{thisBook}{' — и вы соберетесь в круг'}
        {strong.length > 0 && (
          <>
            {', где '}
            <em>{joinNamesText(strong.map((b) => b.pseudonym))} очень {strongInterestVerb} читать</em>
          </>
        )}
        {'.'}
      </>
    )
  }

  if (upgraded.length > 0) {
    const interestVerb = upgraded.length === 1 ? 'хочет' : 'хотят'

    return (
      <>
        {renderNames(upgraded.map((b) => b.pseudonym))}
        {` уже в сценарии, но `}{thisBook}{` ${interestVerb} `}
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

function ImpactMetricPills({ move, mode }: { move: MyMoveBook; mode: OptimizationMode }) {
  const coverageGain = impactCoverageGain(move)
  const strongInterestGain = impactStrongInterestGain(move)
  const satisfaction = move.impact?.satisfaction

  if (mode === 'satisfaction') {
    const beneficiaries = move.impact?.beneficiaries ?? []
    const viewerImproved = satisfaction && satisfaction.before !== null
      && satisfaction.after !== null && satisfaction.after < satisfaction.before
    const viewerJoins = satisfaction?.before === null && satisfaction?.after !== null

    // Кто-то выходит из-за борта → «соберётся круг»
    const joinsCircle = beneficiaries.some(b => b.before.place === 'leftOut') || viewerJoins
    if (joinsCircle) {
      return (
        <div className="nd-move-metrics">
          <span className="nd-move-metric nd-move-metric-gain">соберётся круг</span>
        </div>
      )
    }

    // Beneficiary с улучшением ранга (не зритель)
    const improved = beneficiaries.filter(b =>
      b.before.place === 'circle' &&
      b.before.rankBefore !== null && b.afterRank !== null && b.afterRank < b.before.rankBefore
    )

    if (improved.length > 0) {
      const names = improved.slice(0, 2).map(b => declinePseudonym(b.pseudonym, 'dat'))
      const nameStr = improved.length === 1
        ? names[0]
        : names.join(' и ')
      const label = improved.length > 2
        ? `${names.join(' и ')} и ещё ${improved.length - 2} — интереснее`
        : `${nameStr} — интереснее`
      return (
        <div className="nd-move-metrics">
          <span className="nd-move-metric nd-move-metric-gain">{label}</span>
        </div>
      )
    }

    if (viewerImproved) {
      return (
        <div className="nd-move-metrics">
          <span className="nd-move-metric nd-move-metric-gain">тебе — интереснее</span>
        </div>
      )
    }

    return (
      <div className="nd-move-metrics">
        <span className="nd-move-metric nd-move-metric-keep">интересы ближе</span>
      </div>
    )
  }

  return (
    <div className="nd-move-metrics">
      {coverageGain > 0 ? (
        <span className="nd-move-metric nd-move-metric-gain">↑ Покрытие {(move.impact?.coverage.before ?? 0)}→{(move.impact?.coverage.after ?? 0)}</span>
      ) : (
        <span className="nd-move-metric nd-move-metric-keep">Покрытие сохранится</span>
      )}
      {strongInterestGain > 0 ? (
        <span className="nd-move-metric nd-move-metric-gain">↑ +{strongInterestGain} «очень хочу»</span>
      ) : null}
    </div>
  )
}
