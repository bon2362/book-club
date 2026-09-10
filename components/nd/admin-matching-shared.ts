// Общие типы и стили админской вкладки «Матчинг». Цвета, линии и шрифты — только токены
// из app/globals.css. Псевдосостояния (hover, focus-visible, focus-within) задаются
// Tailwind-классами из токенов, потому что inline-стиль их не выражает.
import type React from 'react'
import type { MatchingEventLike } from '@/lib/matching/matching-event-display'
import type { CoordinationBook, CoordinationSummary } from '@/lib/matching/coordination-radar'

export interface MatchingSession {
  id: string
  name: string
  status: string
  deadlineAt: string | null
  createdAt: string
  stateVersion: number
}

export interface MatchingEvent extends MatchingEventLike {
  id: string
  sessionId: string
  stateVersion: number
  occurredAt: string
}

export interface Participant {
  userId: string
  publicRef: string
  joinSource: 'self' | 'admin'
  joinedAt: string
  name: string | null
  role: 'active' | 'observer'
  /** Set when the organiser released this participant's circle to reading. Absent on responses from an older deploy. */
  completedAt?: string | null
  choices: {
    hard: string[]
    conditional: string[]
    assigned: string[]
  }
  /** Full ranked «Хочу читать» list. Absent on responses from an older deploy. */
  wishlist?: Array<{ title: string; rank: number | null }>
  /** Books with personal status `reading`, from any source. Absent on responses from an older deploy. */
  readingNow?: string[]
}

export interface AllUser {
  id: string
  name: string | null
}

export interface CoordinationData {
  summary: CoordinationSummary
  books: CoordinationBook[]
}

export type MatchingSubTab = 'demand' | 'people' | 'log'

export const MATCHING_SUB_TABS: ReadonlyArray<{ id: MatchingSubTab; label: string }> = [
  { id: 'demand', label: 'Спрос по книгам' },
  { id: 'people', label: 'Участники' },
  { id: 'log', label: 'Журнал' },
]

export function parseMatchingSubTab(value: string | null): MatchingSubTab {
  return value === 'people' || value === 'log' ? value : 'demand'
}

export function participantDisplayName(participant: { userId: string; name: string | null }): string {
  return participant.name ?? `${participant.userId.slice(0, 12)}…`
}

export function formatBookTitles(titles: string[]): string {
  return titles.map((title) => `«${title}»`).join(', ')
}

export function formatShortDateTime(value: string): string {
  return new Date(value).toLocaleString('ru-RU', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

/** Видимое кольцо фокуса для клавиатуры: сильная линия, без скруглений и теней. */
export const focusRing = 'focus-visible:outline focus-visible:outline-1 focus-visible:outline-offset-2 focus-visible:outline-border-strong'

export const microLabel: React.CSSProperties = {
  fontFamily: 'var(--nd-sans)',
  textTransform: 'uppercase',
  letterSpacing: '0.13em',
  fontSize: '0.6rem',
  color: 'var(--text-muted)',
}

/** Текстовое действие с подчёркиванием (строка сессии, раскрывашки). */
export const linkAction: React.CSSProperties = {
  fontFamily: 'var(--nd-sans)',
  fontSize: '0.76rem',
  color: 'var(--text-body)',
  textDecoration: 'underline',
  background: 'none',
  border: 0,
  padding: 0,
  cursor: 'pointer',
}

export const primaryButton: React.CSSProperties = {
  fontFamily: 'var(--nd-sans)',
  fontSize: '0.72rem',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  background: 'var(--text)',
  color: 'var(--bg-input)',
  border: 0,
  borderRadius: 'var(--radius)',
  padding: '7px 14px',
  cursor: 'pointer',
  alignSelf: 'flex-start',
}

export const ghostButton: React.CSSProperties = {
  ...primaryButton,
  background: 'none',
  color: 'var(--text-body)',
  border: '1px solid var(--border)',
  borderBottom: '2px solid var(--border-strong)',
}

export const fieldInput: React.CSSProperties = {
  fontFamily: 'var(--nd-sans)',
  fontSize: '0.82rem',
  color: 'var(--text)',
  width: '100%',
  padding: '5px 0',
  background: 'transparent',
  border: 0,
  borderBottom: '1px solid var(--border-strong)',
  borderRadius: 'var(--radius)',
}

export const fieldLabel: React.CSSProperties = {
  ...microLabel,
  display: 'block',
  fontSize: '0.68rem',
  letterSpacing: '0.12em',
  marginBottom: 3,
}

export const warnLine: React.CSSProperties = {
  fontSize: '0.72rem',
  color: 'var(--accent)',
  margin: 0,
}

export const hintText: React.CSSProperties = {
  fontSize: '0.74rem',
  color: 'var(--text-secondary)',
  margin: '0 0 14px',
  maxWidth: '70ch',
  lineHeight: 1.45,
}

export const quietText: React.CSSProperties = {
  fontSize: '0.78rem',
  color: 'var(--text-muted)',
  margin: 0,
}

export const table: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: '0.78rem',
}

export const th: React.CSSProperties = {
  ...microLabel,
  letterSpacing: '0.12em',
  textAlign: 'left',
  fontWeight: 400,
  padding: '0 10px 6px 0',
  borderBottom: '1px solid var(--border)',
}

export const td: React.CSSProperties = {
  padding: '6px 10px 6px 0',
  borderBottom: '1px solid var(--border-subtle)',
  color: 'var(--text-body)',
  verticalAlign: 'baseline',
}

/** Верхняя тонкая линия раскрывающихся блоков (новая сессия, ручное добавление). */
export const disclosureBlock: React.CSSProperties = {
  borderTop: '1px solid var(--hair)',
  paddingTop: 12,
  marginTop: 8,
}

export const formColumn: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  maxWidth: 420,
  marginTop: 10,
}
