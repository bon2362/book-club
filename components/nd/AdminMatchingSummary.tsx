'use client'

import type { CoordinationSummary } from '@/lib/matching/coordination-radar'
import { microLabel } from './admin-matching-shared'

const ITEMS: ReadonlyArray<{ key: keyof CoordinationSummary; label: string; title: string }> = [
  { key: 'activeParticipants', label: 'Активных', title: 'Участники сессии, которые ещё выбирают книгу' },
  { key: 'signedUpParticipants', label: 'Записались', title: 'Активные участники с окончательной записью хотя бы на одну книгу' },
  { key: 'assignedParticipants', label: 'В кругах', title: 'Активные участники, назначенные хотя бы в один круг' },
  { key: 'readingParticipants', label: 'Читают', title: 'Активные участники, у которых есть книга в статусе «читаю»' },
  { key: 'demandedBooks', label: 'Книг в спросе', title: 'Книги, которые держат в «Хочу читать» минимум трое активных участников' },
  { key: 'formedCircles', label: 'Кругов сформировано', title: 'Все круги этой сессии' },
]

export default function AdminMatchingSummary({ summary }: { summary: CoordinationSummary | null }) {
  return (
    <dl
      data-testid="admin-matching-summary"
      aria-busy={summary === null}
      style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '0 34px',
        margin: '16px 0 4px',
        padding: '11px 0',
        borderTop: '1px solid var(--hair)',
        borderBottom: '1px solid var(--hair)',
      }}
    >
      {ITEMS.map((item) => {
        const value = summary?.[item.key] ?? null
        return (
          <div key={item.key} title={item.title} style={{ display: 'flex', flexDirection: 'column-reverse', gap: 3 }}>
            <dt style={{ ...microLabel, fontSize: '0.58rem', letterSpacing: '0.12em', whiteSpace: 'nowrap' }}>{item.label}</dt>
            <dd
              data-testid={`admin-matching-summary-${item.key}`}
              style={{
                margin: 0,
                fontFamily: 'var(--nd-mono)',
                fontSize: '1.05rem',
                color: value ? 'var(--text)' : 'var(--text-muted)',
              }}
            >
              {value ?? '—'}
            </dd>
          </div>
        )
      })}
    </dl>
  )
}
