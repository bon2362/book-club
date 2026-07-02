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
    if (actionPending !== null) return
    setActionPending(circleKey ?? 'cancel'); setErrorMsg(null)
    try {
      const response = await fetch(`/api/matching/sessions/${sessionId}/confirmation`, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...(circleKey ? { circleKey } : {}), expectedStateVersion: stateVersion }) })
      const json = await response.json().catch(() => ({}))
      if (!response.ok) setErrorMsg(json.error ?? 'Не удалось изменить выбор')
      else {
        onConfirmationChange?.()
        setDialogOpen(false)
        setPendingCircle(null)
      }
    } catch {
      setErrorMsg('Не удалось изменить выбор. Проверьте соединение и попробуйте снова.')
    } finally { setActionPending(null) }
  }

  function showBook(book: ScenarioBookMeta | undefined, circle: PublicScenarioCircle) { if (book) openBook(book, popupChips(circle)) }

  if (scenarios.length === 0) return <div data-testid="matching-scenarios-empty" style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)', fontFamily: 'var(--nd-sans)' }}>Пока недостаточно участников для формирования кругов.</div>

  return <>
    {errorMsg && <div role="alert" style={{ borderLeft: '3px solid var(--accent)', padding: '0.6rem 0.9rem', color: 'var(--accent)', marginBottom: '0.7rem' }}>{errorMsg}</div>}
    <ul data-testid="matching-scenarios-list" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {scenarios.map((scenario, index) => <li key={scenario.ref} data-testid="matching-scenario-card" style={{ background: 'var(--bg-elevated)', borderRadius: 'var(--radius)', padding: '1rem' }}>
        <header style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '0.7rem', marginBottom: '0.9rem' }}>
          <h3 style={{ margin: 0, fontFamily: 'var(--nd-sans)', fontSize: '0.62rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted)' }}>Сценарий {index + 1}</h3>
        </header>
        <div className="nd-scenario-circles">
          {scenario.circles.map(circle => {
            const book = booksById[circle.bookId]
            const waiting = circle.viewerIsMember && viewerConfirmedCircleKey === circle.circleKey
            return <article key={circle.circleKey} data-testid="matching-circle" className="nd-scenario-circle" style={{ borderTop: `3px solid ${waiting ? 'var(--success)' : 'var(--border)'}`, borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)', borderLeft: '1px solid var(--border)', padding: '0.75rem', display: 'flex', flexDirection: 'column', minWidth: 0 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '54px minmax(0, 1fr)', gap: '0.7rem', marginBottom: '0.7rem' }}>
                <button type="button" className="nd-book-link" aria-label={`Открыть книгу «${book?.title ?? 'Книга'}»`} onClick={() => showBook(book, circle)}><CoverImage coverUrl={book?.coverUrl ?? null} title={book?.title ?? 'Книга'} author={book?.author ?? ''} /></button>
                <div style={{ minWidth: 0 }}><button type="button" className="nd-book-title-button" onClick={() => showBook(book, circle)}>{book?.title ?? 'Книга'}</button><div style={{ marginTop: '0.2rem', fontSize: '0.74rem', color: 'var(--text-muted)' }}>{book?.author ?? ''}</div></div>
              </div>
              <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.3rem' }}>{circle.members.map(member => <li key={member.ref} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}><ParticipantInterestChip userId={member.ref} displayName={member.displayName} rank={member.rank} />{member.confirmed && <span aria-label={`${member.displayName}: подтвердил`} style={{ color: 'var(--success)' }}>✓</span>}</li>)}</ul>
              <div style={{ marginTop: 'auto', paddingTop: '0.7rem' }}>
                {waiting && <div data-testid="circle-waiting" style={{ borderLeft: '2px solid var(--success)', paddingLeft: '0.6rem', color: 'var(--success)', fontSize: '0.76rem' }}><strong>Вы выбрали этот круг</strong><div>Подтверждено · {circle.confirmedCount} из {circle.memberCount} · временно</div>{!readOnly && <button type="button" data-testid="circle-cancel-button" className="p-btn ghost sm" disabled={actionPending === 'cancel'} onClick={() => mutate('DELETE')} style={{ marginTop: '0.5rem' }}>Отменить</button>}</div>}
                {circle.viewerIsMember && !waiting && !readOnly && <div className="nd-circle-cta"><button type="button" data-testid="circle-confirm-button" className="p-btn success" disabled={actionPending === circle.circleKey} onClick={() => { setPendingCircle(circle); setDialogOpen(true) }}>Хочу в этот круг</button></div>}
              </div>
            </article>
          })}
        </div>
      </li>)}
    </ul>
    {pendingCircle && <MatchingConfirmationDialog open={dialogOpen} from={currentCircle ? { bookTitle: booksById[currentCircle.bookId]?.title ?? 'Книга', members: currentCircle.members.map(m => m.displayName) } : null} to={{ bookTitle: booksById[pendingCircle.bookId]?.title ?? 'Книга', members: pendingCircle.members.map(m => m.displayName) }} pending={actionPending !== null} onConfirm={() => mutate('PUT', pendingCircle.circleKey)} onCancel={() => { if (actionPending === null) { setDialogOpen(false); setPendingCircle(null) } }} />}
  </>
}
