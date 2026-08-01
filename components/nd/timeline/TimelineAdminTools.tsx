'use client'

import { useMemo, useState } from 'react'
import type { TimelineEpochView, TimelineEventView } from '@/lib/timeline/view-model'
import { formatDateRange } from './format-historical-date'

export type TimelineSearchItem =
  | { kind: 'event'; item: TimelineEventView }
  | { kind: 'epoch'; item: TimelineEpochView }

interface Props {
  items: TimelineSearchItem[]
  onCreate: (kind: 'event' | 'epoch') => void
  onSelect: (selected: TimelineSearchItem) => void
}

export default function TimelineAdminTools({ items, onCreate, onSelect }: Props) {
  const [query, setQuery] = useState('')
  const results = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ru')
    if (!normalized) return []
    return items.filter(({ item }) => item.title.toLocaleLowerCase('ru').includes(normalized)).slice(0, 8)
  }, [items, query])

  return (
    <div data-testid="timeline-admin-tools" style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.45rem 0', borderBottom: '1px solid var(--hair)' }}>
      <label style={{ flex: '1 1 18rem', maxWidth: '30rem' }}>
        <span className="sr-only">Найти в общей базе</span>
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Найти в базе…"
          aria-label="Найти в базе"
          style={{ width: '100%', padding: '0.38rem 0.55rem', border: '1px solid var(--hair)', borderBottom: '1px solid var(--tl-axis)', background: 'var(--bg-input)', color: 'var(--text)', font: '0.76rem/1.2 var(--nd-sans)' }}
        />
      </label>
      <div style={{ flex: 1 }} />
      <button type="button" onClick={() => onCreate('event')} style={{ border: '1px solid var(--text)', background: 'transparent', color: 'var(--text)', padding: '0.35rem 0.7rem', font: '0.65rem/1 var(--nd-sans)', letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}>+ Событие</button>
      <button type="button" onClick={() => onCreate('epoch')} style={{ border: '1px solid var(--text)', background: 'transparent', color: 'var(--text)', padding: '0.35rem 0.7rem', font: '0.65rem/1 var(--nd-sans)', letterSpacing: '0.06em', textTransform: 'uppercase', cursor: 'pointer' }}>+ Эпоха</button>

      {results.length > 0 ? (
        <div role="listbox" aria-label="Результаты поиска по базе" style={{ position: 'absolute', zIndex: 30, left: 0, top: 'calc(100% - 0.2rem)', width: 'min(34rem, 90vw)', padding: '0.3rem', background: 'var(--bg-input)', boxShadow: 'var(--shadow-pop)' }}>
          {results.map((result) => (
            <button
              key={`${result.kind}-${result.item.id}`}
              type="button"
              role="option"
              aria-selected="false"
              onClick={() => { setQuery(''); onSelect(result) }}
              style={{ display: 'grid', gridTemplateColumns: '1fr auto auto', gap: '0.7rem', width: '100%', padding: '0.5rem', border: 'none', borderBottom: '1px solid var(--hair)', background: 'transparent', color: 'var(--text)', textAlign: 'left', cursor: 'pointer', font: '0.78rem/1.2 var(--nd-sans)' }}
            >
              <span>{result.item.title}</span>
              <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--nd-mono)' }}>{formatDateRange(result.item)}</span>
              <span style={{ color: result.item.isLibrary ? 'var(--accent)' : 'var(--text-muted)', fontSize: '0.68rem' }}>{result.item.isLibrary ? '+ прикрепить' : 'в ленте'}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
