'use client'

import CoverImage from './CoverImage'
import { useBookDetail } from './BookDetailProvider'
import type { ScenarioBookMeta } from './MatchingScenarios'
import type { BookParticipant } from './MatchingPersonalList'

export interface LockedCircleMember { ref: string; displayName: string }
export interface LockedCircle { circleKey: string; bookId: string; lockedAt: string; members: LockedCircleMember[] }
interface Props { circles: LockedCircle[]; viewerLockedCircleKey: string | null; booksById?: Record<string, ScenarioBookMeta> }

export default function MatchingLockedCircles({ circles, viewerLockedCircleKey, booksById = {} }: Props) {
  const { openBook } = useBookDetail()
  if (circles.length === 0) return null
  const own = circles.find(circle => circle.circleKey === viewerLockedCircleKey) ?? null
  const others = circles.filter(circle => circle.circleKey !== viewerLockedCircleKey)
  const show = (circle: LockedCircle) => { const book = booksById[circle.bookId]; if (book) openBook(book, circle.members.map((member): BookParticipant => ({ ref: member.ref, bookId: circle.bookId, displayName: member.displayName, rank: null, personalStatus: null }))) }
  const card = (circle: LockedCircle) => { const book = booksById[circle.bookId]; return <article key={circle.circleKey} data-testid="matching-locked-circle" style={{ background: 'var(--bg-tag-green)', borderTop: '2px solid var(--success)', borderRadius: 'var(--radius)', padding: '0.8rem', display: 'grid', gridTemplateColumns: '54px minmax(0, 1fr)', gap: '0.7rem' }}><button type="button" className="nd-book-link" aria-label={`Открыть книгу «${book?.title ?? 'Книга круга'}»`} onClick={() => show(circle)}><CoverImage coverUrl={book?.coverUrl ?? null} title={book?.title ?? 'Книга круга'} author={book?.author ?? ''} /></button><div><button type="button" className="nd-book-title-button" onClick={() => show(circle)}>{book?.title ?? 'Книга круга'}</button><div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: '0.15rem' }}>{book?.author ?? ''}</div><ul style={{ margin: '0.5rem 0 0', padding: 0, listStyle: 'none', display: 'flex', flexWrap: 'wrap', gap: '0.35rem 0.8rem' }}>{circle.members.map(member => <li key={member.ref} style={{ fontSize: '0.8rem', color: 'var(--text-body)' }}>{member.displayName} <span aria-label="подтвердил" style={{ color: 'var(--success)' }}>✓</span></li>)}</ul></div></article> }
  return <section data-testid="matching-locked-circles" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
    {own && <div data-testid="matching-own-locked-circle" style={{ borderLeft: '3px solid var(--success)', paddingLeft: '1rem' }}><h2 style={{ margin: '0 0 0.3rem', fontFamily: 'var(--nd-serif)', fontSize: '1.25rem', color: 'var(--success)' }}>Ваш круг</h2><p style={{ margin: '0 0 0.8rem', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Все участники подтвердили состав. Вы больше не участвуете в расчётах, но можете наблюдать за сессией.</p>{card(own)}<span className="p-status" style={{ display: 'inline-block', marginTop: '0.5rem' }}>Вы наблюдаете</span></div>}
    {others.length > 0 && <div data-testid="matching-locked-registry"><h2 style={{ margin: '0 0 0.6rem', fontFamily: 'var(--nd-sans)', fontSize: '0.6rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Закреплённые круги</h2><div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(230px, 100%), 1fr))', gap: '0.7rem' }}>{others.map(card)}</div></div>}
  </section>
}
