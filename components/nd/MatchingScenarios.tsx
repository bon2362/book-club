'use client'

import { useState } from 'react'
import MatchingConfirmationDialog from './MatchingConfirmationDialog'
import CoverImage from './CoverImage'
import ParticipantInterestChip from './ParticipantInterestChip'
import { useBookDetail } from './BookDetailProvider'
import type { MatchingBookDetail } from './MatchingBookDetailModal'
import type { BookParticipant } from './MatchingPersonalList'

export interface PublicScenarioMember { ref: string; displayName: string; rank: number | null; interest: 'очень хочу' | 'хочу' | 'без ранга'; confirmed: boolean }
export interface PublicScenarioCircle { circleKey: string; bookId: string; members: PublicScenarioMember[]; avgRank: number | null; confirmedCount: number; memberCount: number; viewerIsMember: boolean }
export interface PublicScenario { ref: string; score: { coveredCount: number; totalCount: number; avgRank: number | null; worstRank: number | null }; leftOut: Array<{ ref: string; displayName: string }>; circles: PublicScenarioCircle[] }
export type ScenarioBookMeta = MatchingBookDetail

interface Props {
  sessionId: string; stateVersion: number; scenarios: PublicScenario[]
  viewerConfirmedCircleKey: string | null; viewerRole: 'active' | 'observer'; frozen: boolean
  booksById?: Record<string, ScenarioBookMeta>; onConfirmationChange?: () => void
}

function circleWord(n: number) { const m10 = n % 10; const m100 = n % 100; return m10 === 1 && m100 !== 11 ? 'круг' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'круга' : 'кругов' }
function formatRank(value: number | null) { return value === null ? '—' : Number.isInteger(value) ? String(value) : value.toFixed(1) }
function popupChips(circle: PublicScenarioCircle): BookParticipant[] { return circle.members.map(member => ({ ref: member.ref, bookId: circle.bookId, displayName: member.displayName, rank: member.rank, personalStatus: null })) }

export default function MatchingScenarios({ sessionId, stateVersion, scenarios, viewerConfirmedCircleKey, viewerRole, frozen, booksById = {}, onConfirmationChange }: Props) {
  const { openBook } = useBookDetail()
  const [pendingCircle, setPendingCircle] = useState<PublicScenarioCircle | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [actionPending, setActionPending] = useState<string | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const readOnly = frozen || viewerRole === 'observer'
  const allCircles = scenarios.flatMap(s => s.circles)
  const currentCircle = viewerConfirmedCircleKey ? allCircles.find(c => c.circleKey === viewerConfirmedCircleKey) ?? null : null

  async function mutate(method: 'PUT' | 'DELETE', circleKey?: string) {
    setActionPending(circleKey ?? 'cancel'); setErrorMsg(null)
    try {
      const response = await fetch(`/api/matching/sessions/${sessionId}/confirmation`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...(circleKey ? { circleKey } : {}), expectedStateVersion: stateVersion }) })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) setErrorMsg(json.error ?? 'Не удалось изменить выбор')
      else onConfirmationChange?.()
    } finally { setActionPending(null); setDialogOpen(false); setPendingCircle(null) }
  }

  function showBook(book: ScenarioBookMeta | undefined, circle: PublicScenarioCircle) { if (book) openBook(book, popupChips(circle)) }

  if (scenarios.length === 0) return <div data-testid="matching-scenarios-empty" style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--nd-sans)' }}>Пока недостаточно участников для формирования кругов.</div>

  return <>
    {errorMsg && <div role="alert" style={{ borderLeft: '3px solid var(--accent)', padding: '0.6rem 0.9rem', color: 'var(--accent)', marginBottom: '0.7rem' }}>{errorMsg}</div>}
    <ul data-testid="matching-scenarios-list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {scenarios.map((scenario, index) => <li key={scenario.ref} data-testid="matching-scenario-card" style={{ border: '1px solid var(--hair)', padding: '1rem' }}>
        <header style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap', borderBottom: '1px solid var(--hair-soft)', paddingBottom: '0.7rem', marginBottom: '0.9rem' }}>
          <h3 style={{ margin: 0, fontFamily: 'var(--nd-sans)', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted)' }}>Сценарий {index + 1}</h3>
          <div style={{ display: 'flex', gap: '0.9rem', flexWrap: 'wrap', fontSize: '0.76rem', color: 'var(--text-muted)' }}>
            <span>средний ранг {formatRank(scenario.score.avgRank)}</span><span>{scenario.circles.length} {circleWord(scenario.circles.length)}</span><span>охват {scenario.score.coveredCount} из {scenario.score.totalCount}</span>
          </div>
        </header>
        {scenario.leftOut.length > 0 && <p style={{ margin: '0 0 0.8rem', fontSize: '0.76rem', color: 'var(--text-muted)' }}>За бортом остаётся: {scenario.leftOut.map(p => p.displayName).join(', ')}</p>}
        <div className="nd-scenario-circles">
          {scenario.circles.map(circle => {
            const book = booksById[circle.bookId]
            const waiting = circle.viewerIsMember && viewerConfirmedCircleKey === circle.circleKey
            return <article key={circle.circleKey} data-testid="matching-circle" className="nd-scenario-circle" style={{ borderTop: `3px solid ${waiting ? 'var(--accent)' : 'var(--hair)'}`, borderRight: '1px solid var(--hair)', borderBottom: '1px solid var(--hair)', borderLeft: '1px solid var(--hair)', padding: '0.75rem', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '54px minmax(0, 1fr)', gap: '0.7rem', marginBottom: '0.7rem' }}>
                <button type="button" className="nd-book-link" aria-label={`Открыть книгу «${book?.title ?? 'Книга'}»`} onClick={() => showBook(book, circle)}><CoverImage coverUrl={book?.coverUrl ?? null} title={book?.title ?? 'Книга'} author={book?.author ?? ''} /></button>
                <div style={{ minWidth: 0 }}><button type="button" className="nd-book-title-button" onClick={() => showBook(book, circle)}>{book?.title ?? 'Книга'}</button><div style={{ marginTop: '0.2rem', fontSize: '0.74rem', color: 'var(--text-muted)' }}>{book?.author ?? ''}</div><div style={{ marginTop: '0.35rem', fontSize: '0.68rem', color: 'var(--text-muted)' }}>{circle.memberCount} участников · ср. ранг {formatRank(circle.avgRank)}</div></div>
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>{circle.members.map(member => <li key={member.ref} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}><ParticipantInterestChip userId={member.ref} displayName={member.displayName} rank={member.rank} /><span aria-label={`${member.displayName}: ${member.confirmed ? 'подтвердил' : 'не подтвердил'}`} style={{ color: member.confirmed ? 'var(--success)' : 'var(--text-muted)' }}>{member.confirmed ? '✓' : '○'}</span></li>)}</ul>
              <div style={{ marginTop: 'auto', paddingTop: '0.7rem' }}>
                {waiting && <div data-testid="circle-waiting" style={{ borderLeft: '3px solid var(--accent)', paddingLeft: '0.6rem', color: 'var(--accent)', fontSize: '0.76rem' }}><strong>Вы выбрали этот круг</strong><div>{circle.confirmedCount} из {circle.memberCount} · временно, ждём остальных</div>{!readOnly && <button type="button" data-testid="circle-cancel-button" className="nd-text-action" disabled={actionPending === 'cancel'} onClick={() => mutate('DELETE')}>Отменить</button>}</div>}
                {circle.viewerIsMember && !waiting && !readOnly && <div className="nd-circle-cta"><button type="button" data-testid="circle-confirm-button" className="nd-primary-action" disabled={actionPending === circle.circleKey} onClick={() => { setPendingCircle(circle); setDialogOpen(true) }}>Хочу в этот круг</button></div>}
              </div>
            </article>
          })}
        </div>
      </li>)}
    </ul>
    {pendingCircle && <MatchingConfirmationDialog open={dialogOpen} from={currentCircle ? { bookTitle: booksById[currentCircle.bookId]?.title ?? 'Книга', members: currentCircle.members.map(m => m.displayName) } : null} to={{ bookTitle: booksById[pendingCircle.bookId]?.title ?? 'Книга', members: pendingCircle.members.map(m => m.displayName) }} onConfirm={() => mutate('PUT', pendingCircle.circleKey)} onCancel={() => { setDialogOpen(false); setPendingCircle(null) }} />}
  </>
}
