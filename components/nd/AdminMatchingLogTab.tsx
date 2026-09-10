'use client'

import { useCallback, useMemo, useState } from 'react'
import {
  formatMatchingActor,
  formatMatchingEvent,
  formatMatchingSubject,
  matchingEventTypeLabel,
  matchingSourceLabel,
} from '@/lib/matching/matching-event-display'
import {
  focusRing,
  formatShortDateTime,
  ghostButton,
  linkAction,
  microLabel,
  quietText,
  table,
  td,
  th,
  type MatchingEvent,
} from './admin-matching-shared'

// How many events to reveal per "show more" click.
export const EVENTS_PAGE_SIZE = 10

const EMPTY_FILTERS = { day: '', eventType: '', source: '', actor: '', subject: '' }
type EventFilters = typeof EMPTY_FILTERS

function eventDay(event: MatchingEvent): string {
  return new Date(event.occurredAt).toLocaleDateString('ru-RU')
}

const filterSelectStyle: React.CSSProperties = {
  fontFamily: 'var(--nd-sans)',
  fontSize: '0.72rem',
  border: '1px solid var(--border)',
  borderBottom: '2px solid var(--border-strong)',
  borderRadius: 'var(--radius)',
  background: 'var(--bg-input)',
  color: 'var(--text-body)',
  padding: '4px 6px',
  maxWidth: 180,
}

interface LogTabProps {
  events: MatchingEvent[]
  loading: boolean
  isSessionOpen: boolean
  onRefresh: () => void
}

/** Состояние фильтров живёт здесь; родитель пересоздаёт вкладку по `key` при смене сессии. */
export default function AdminMatchingLogTab({ events, loading, isSessionOpen, onRefresh }: LogTabProps) {
  const [filters, setFilters] = useState<EventFilters>(EMPTY_FILTERS)
  const [visibleCount, setVisibleCount] = useState(EVENTS_PAGE_SIZE)
  const [totalsOpen, setTotalsOpen] = useState(false)

  // Distinct values for each filterable column, derived from the loaded events.
  const options = useMemo(() => {
    const days = new Set<string>()
    const eventTypes = new Set<string>()
    const sources = new Set<string>()
    const actors = new Set<string>()
    const subjects = new Set<string>()
    for (const event of events) {
      days.add(eventDay(event))
      eventTypes.add(event.eventType)
      sources.add(event.source)
      actors.add(formatMatchingActor(event))
      subjects.add(formatMatchingSubject(event))
    }
    return {
      days: Array.from(days),
      eventTypes: Array.from(eventTypes),
      sources: Array.from(sources),
      actors: Array.from(actors).sort((a, b) => a.localeCompare(b, 'ru')),
      subjects: Array.from(subjects).sort((a, b) => a.localeCompare(b, 'ru')),
    }
  }, [events])

  const totals = useMemo(() => {
    const counts = new Map<string, number>()
    for (const event of events) counts.set(event.eventType, (counts.get(event.eventType) ?? 0) + 1)
    return Array.from(counts.entries())
      .map(([type, count]) => ({ label: matchingEventTypeLabel(type), count }))
      .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'ru'))
  }, [events])

  const filtered = useMemo(() => events.filter((event) => (
    (!filters.day || eventDay(event) === filters.day) &&
    (!filters.eventType || event.eventType === filters.eventType) &&
    (!filters.source || event.source === filters.source) &&
    (!filters.actor || formatMatchingActor(event) === filters.actor) &&
    (!filters.subject || formatMatchingSubject(event) === filters.subject)
  )), [events, filters])

  const updateFilter = useCallback((key: keyof EventFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: value }))
    setVisibleCount(EVENTS_PAGE_SIZE)
  }, [])

  const hasActiveFilter = Object.values(filters).some(Boolean)

  const selects: Array<{ key: keyof EventFilters; label: string; allLabel: string; values: string[]; format?: (value: string) => string }> = [
    { key: 'day', label: 'Фильтр по дате', allLabel: 'Когда: все', values: options.days },
    { key: 'eventType', label: 'Фильтр по событию', allLabel: 'Событие: все', values: options.eventTypes, format: matchingEventTypeLabel },
    { key: 'source', label: 'Фильтр по источнику', allLabel: 'Источник: все', values: options.sources, format: matchingSourceLabel },
    { key: 'actor', label: 'Фильтр по актору', allLabel: 'Актор: все', values: options.actors },
    { key: 'subject', label: 'Фильтр по участнику', allLabel: 'Участник: все', values: options.subjects },
  ]

  return (
    <section data-testid="admin-matching-log">
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 6 }}>
        <button type="button" onClick={onRefresh} className={focusRing} style={{ ...linkAction, fontSize: '0.7rem', color: 'var(--text-secondary)' }}>
          обновить
        </button>
      </div>

      {loading && events.length === 0 && <p style={quietText}>Загрузка…</p>}
      {!loading && events.length === 0 && (
        <p style={quietText}>
          {isSessionOpen
            ? 'После входа в сессию участники ещё не меняли предпочтения.'
            : 'В этой сессии не было изменений предпочтений.'}
        </p>
      )}

      {events.length > 0 && (
        <>
          <div
            data-testid="admin-matching-preference-filters"
            style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}
          >
            {selects.map((select) => (
              <select
                key={select.key}
                aria-label={select.label}
                value={filters[select.key]}
                onChange={(event) => updateFilter(select.key, event.target.value)}
                className={focusRing}
                style={filterSelectStyle}
              >
                <option value="">{select.allLabel}</option>
                {select.values.map((value) => (
                  <option key={value} value={value}>{select.format ? select.format(value) : value}</option>
                ))}
              </select>
            ))}
            {hasActiveFilter && (
              <button
                type="button"
                onClick={() => { setFilters(EMPTY_FILTERS); setVisibleCount(EVENTS_PAGE_SIZE) }}
                className={focusRing}
                style={{ ...linkAction, fontSize: '0.72rem' }}
                data-testid="admin-matching-preference-reset"
              >
                Сбросить
              </button>
            )}
            <button
              type="button"
              aria-expanded={totalsOpen}
              aria-controls="admin-matching-event-totals"
              onClick={() => setTotalsOpen((value) => !value)}
              className={focusRing}
              style={{ ...linkAction, fontSize: '0.72rem', color: 'var(--text-secondary)', marginLeft: 6 }}
              data-testid="admin-matching-event-totals-toggle"
            >
              {totalsOpen ? 'скрыть сводку по типам' : 'сводка по типам событий'}
            </button>
          </div>

          {totalsOpen && (
            <div
              id="admin-matching-event-totals"
              data-testid="admin-matching-event-totals"
              style={{ display: 'flex', flexWrap: 'wrap', gap: '0 24px', padding: '0 0 12px', borderBottom: '1px solid var(--hair)', marginBottom: 12 }}
            >
              {totals.map((total) => (
                <span key={total.label} style={{ display: 'flex', gap: '0.4rem', alignItems: 'baseline', fontSize: '0.72rem', color: 'var(--text-secondary)', padding: '2px 0' }}>
                  {total.label}
                  <span style={{ fontFamily: 'var(--nd-mono)', color: 'var(--text)' }}>{total.count}</span>
                </span>
              ))}
            </div>
          )}

          {filtered.length === 0 ? (
            <p style={quietText}>Под фильтры ничего не подходит.</p>
          ) : (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table data-testid="admin-matching-preference-events" style={table}>
                  <thead>
                    <tr>
                      <th style={th}>Когда</th>
                      <th style={th}>Событие</th>
                      <th style={th}>Источник</th>
                      <th style={th}>Актор</th>
                      <th style={th}>Участник</th>
                      <th style={th}>Деталь</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.slice(0, visibleCount).map((event) => (
                      <tr key={event.id}>
                        <td style={{ ...td, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>{formatShortDateTime(event.occurredAt)}</td>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>{matchingEventTypeLabel(event.eventType)}</td>
                        <td style={{ ...td, color: 'var(--text-secondary)' }}>{matchingSourceLabel(event.source)}</td>
                        <td style={{ ...td, color: 'var(--text-secondary)' }}>{formatMatchingActor(event)}</td>
                        <td style={{ ...td, color: 'var(--text-secondary)' }}>{formatMatchingSubject(event)}</td>
                        <td style={{ ...td, color: 'var(--text-muted)' }}>{formatMatchingEvent(event)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 10 }}>
                <span style={microLabel}>
                  Показано {Math.min(visibleCount, filtered.length)} из {filtered.length}
                </span>
                {visibleCount < filtered.length && (
                  <button
                    type="button"
                    onClick={() => setVisibleCount((count) => count + EVENTS_PAGE_SIZE)}
                    className={focusRing}
                    style={ghostButton}
                    data-testid="admin-matching-preference-show-more"
                  >
                    Показать ещё {Math.min(EVENTS_PAGE_SIZE, filtered.length - visibleCount)}
                  </button>
                )}
              </div>
            </>
          )}
        </>
      )}
    </section>
  )
}
