'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { compareHistoricalDates } from '@/lib/timeline'
import MembershipDetail, { type Membership } from './MembershipDetail'
import { DEFAULT_TIMELINE_EPOCH_COLOR } from './palette'
import {
  SANS,
  SERIF,
  type AdminEpochRow,
  type AdminEventRow,
  type AdminTimelineContents,
  buttonStyle,
  errorStyle,
  formatDateLabel,
  formatRangeLabel,
  inputStyle,
  microLabelStyle,
  readError,
  rowStart,
  rowStyle,
} from './shared'

/**
 * Экран сборки ленты: две колонки — «В ленте» и «Можно добавить» — с полем
 * поиска над каждой и переключателем «События / Эпохи».
 *
 * Колонка «В ленте» упорядочена **хронологически**, как сама лента: сравнение
 * идёт через `compareHistoricalDates`, а не по строкам и не по году. У дат есть
 * эры, и «50 до н. э.» числом выглядит раньше «10 до н. э.», хотя это не так.
 */

type Kind = 'events' | 'epochs'

/** Строка справочника, ещё не включённая в ленту. */
type AvailableRow = { kind: 'event'; item: AdminEventRow } | { kind: 'epoch'; item: AdminEpochRow }

function rangeLabel(row: Membership | AvailableRow): string {
  return row.kind === 'event' ? eventRangeLabel(row.item) : epochRangeLabel(row.item)
}

interface Props {
  timelineId: string
  onBack: () => void
}

function matches(title: string, query: string): boolean {
  return title.toLowerCase().includes(query.trim().toLowerCase())
}

function byChronology<T extends Parameters<typeof rowStart>[0]>(left: T, right: T): number {
  return compareHistoricalDates(rowStart(left), rowStart(right))
}

function eventRangeLabel(row: AdminEventRow): string {
  return formatRangeLabel(
    rowStart(row),
    row.endYear != null
      ? {
          year: row.endYear,
          era: row.endEra === 'BCE' ? 'BCE' : 'CE',
          ...(row.endMonth != null ? { month: row.endMonth } : {}),
          ...(row.endDay != null ? { day: row.endDay } : {}),
        }
      : null,
    row.ongoing,
  )
}

function epochRangeLabel(row: AdminEpochRow): string {
  const end =
    row.endYear != null
      ? formatDateLabel({ year: row.endYear, era: row.endEra === 'BCE' ? 'BCE' : 'CE' })
      : '—'
  return `${formatDateLabel({ year: row.startYear, era: row.startEra === 'BCE' ? 'BCE' : 'CE' })} — ${end}`
}

const columnStyle = {
  border: '1px solid var(--border)',
  padding: '0.9rem',
} as const

export default function TimelineContents({ timelineId, onBack }: Props) {
  const [data, setData] = useState<AdminTimelineContents | null>(null)
  const [kind, setKind] = useState<Kind>('events')
  const [includedQuery, setIncludedQuery] = useState('')
  const [availableQuery, setAvailableQuery] = useState('')
  const [selected, setSelected] = useState<Membership | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/timeline/timelines/${timelineId}/contents`)
      const message = await readError(res)
      if (message) { setError(message); return }
      const json = (await res.json()) as { data: AdminTimelineContents }
      setData(json.data)
    } catch {
      setError('Не удалось загрузить состав ленты')
    } finally {
      setLoading(false)
    }
  }, [timelineId])

  useEffect(() => { void reload() }, [reload])

  const included = useMemo<Membership[]>(() => {
    if (!data) return []
    const rows: Membership[] =
      kind === 'events'
        ? [...data.events].sort(byChronology).map(item => ({ kind: 'event', item }))
        : [...data.epochs].sort(byChronology).map(item => ({ kind: 'epoch', item }))
    return rows.filter(row => matches(row.item.title, includedQuery))
  }, [data, kind, includedQuery])

  const available = useMemo<AvailableRow[]>(() => {
    if (!data) return []
    const rows: AvailableRow[] =
      kind === 'events'
        ? [...data.availableEvents].sort(byChronology).map(item => ({ kind: 'event', item }))
        : [...data.availableEpochs].sort(byChronology).map(item => ({ kind: 'epoch', item }))
    return rows.filter(row => matches(row.item.title, availableQuery))
  }, [data, kind, availableQuery])

  async function include(id: string) {
    setError(null)
    const url =
      kind === 'events'
        ? `/api/admin/timeline/timelines/${timelineId}/events/${id}`
        : `/api/admin/timeline/timelines/${timelineId}/epochs/${id}`
    const body =
      kind === 'events'
        ? { note: '' }
        : { note: '', color: DEFAULT_TIMELINE_EPOCH_COLOR, visible: true, pinnedLane: null }

    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const message = await readError(res)
    if (message) { setError(message); return }
    await reload()
  }

  async function exclude(id: string) {
    setError(null)
    const url =
      kind === 'events'
        ? `/api/admin/timeline/timelines/${timelineId}/events/${id}`
        : `/api/admin/timeline/timelines/${timelineId}/epochs/${id}`

    const res = await fetch(url, { method: 'DELETE' })
    const message = await readError(res)
    if (message) { setError(message); return }
    await reload()
  }

  if (selected) {
    return (
      <div data-testid="timeline-contents" style={{ maxWidth: '46rem' }}>
        <MembershipDetail
          timelineId={timelineId}
          membership={selected}
          onSaved={() => { setSelected(null); void reload() }}
          onCancel={() => setSelected(null)}
        />
      </div>
    )
  }

  return (
    <div data-testid="timeline-contents" style={{ fontFamily: SANS }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <button type="button" onClick={onBack} style={buttonStyle()} data-testid="contents-back">
          К списку лент
        </button>
        {data && (
          <>
            <h3 style={{ fontFamily: SERIF, fontSize: '1.05rem', color: 'var(--text)', margin: 0 }}>
              {data.timeline.title}
            </h3>
            <Link
              href={`/timeline/${data.timeline.slug}`}
              data-testid="contents-public-link"
              style={{ fontFamily: SANS, fontSize: '0.7rem', color: 'var(--accent)', textDecoration: 'none' }}
            >
              /timeline/{data.timeline.slug}
            </Link>
          </>
        )}
      </div>

      <div style={{ display: 'flex', gap: '1.25rem', marginBottom: '1rem' }}>
        {(['events', 'epochs'] as Kind[]).map(item => (
          <button
            key={item}
            type="button"
            onClick={() => setKind(item)}
            data-testid={`contents-kind-${item}`}
            style={{
              fontFamily: SANS,
              fontSize: '0.65rem',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              padding: '0.3rem 0',
              background: 'none',
              border: 'none',
              borderBottom: kind === item ? '2px solid var(--text)' : '2px solid transparent',
              color: kind === item ? 'var(--text)' : 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            {item === 'events' ? 'События' : 'Эпохи'}
          </button>
        ))}
      </div>

      {error && <p style={errorStyle} role="alert" data-testid="contents-error">{error}</p>}

      {loading && (
        <p style={{ fontFamily: SANS, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Загрузка…</p>
      )}

      {!loading && data && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(20rem, 1fr))', gap: '1.25rem' }}>
          <section style={columnStyle} data-testid="contents-included">
            <span style={microLabelStyle}>В ленте — {included.length}</span>
            <input
              value={includedQuery}
              onChange={event => setIncludedQuery(event.target.value)}
              placeholder="Поиск"
              data-testid="contents-search-included"
              aria-label="Поиск в ленте"
              style={{ ...inputStyle, marginBottom: '0.6rem' }}
            />
            {included.length === 0 && (
              <p style={{ fontFamily: SERIF, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                Пока ничего не включено.
              </p>
            )}
            {included.map(row => (
              <div key={row.item.id} data-testid="contents-included-row" style={{ ...rowStyle, cursor: 'default' }}>
                <button
                  type="button"
                  onClick={() => setSelected(row)}
                  data-testid="contents-open-membership"
                  style={{
                    flex: 1,
                    textAlign: 'left',
                    background: 'transparent',
                    border: 'none',
                    padding: 0,
                    fontFamily: SANS,
                    fontSize: '0.85rem',
                    color: 'var(--text)',
                    cursor: 'pointer',
                  }}
                >
                  {row.item.title}
                </button>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  {rangeLabel(row)}
                </span>
                <button
                  type="button"
                  onClick={() => void exclude(row.item.id)}
                  data-testid="contents-exclude"
                  style={buttonStyle('danger')}
                >
                  Исключить
                </button>
              </div>
            ))}
          </section>

          <section style={columnStyle} data-testid="contents-available">
            <span style={microLabelStyle}>Можно добавить — {available.length}</span>
            <input
              value={availableQuery}
              onChange={event => setAvailableQuery(event.target.value)}
              placeholder="Поиск"
              data-testid="contents-search-available"
              aria-label="Поиск среди доступных"
              style={{ ...inputStyle, marginBottom: '0.6rem' }}
            />
            {available.length === 0 && (
              <p style={{ fontFamily: SERIF, fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
                Всё уже в ленте.
              </p>
            )}
            {available.map(row => (
              <div key={row.item.id} data-testid="contents-available-row" style={{ ...rowStyle, cursor: 'default' }}>
                <span style={{ flex: 1 }}>{row.item.title}</span>
                <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                  {rangeLabel(row)}
                </span>
                <button
                  type="button"
                  onClick={() => void include(row.item.id)}
                  data-testid="contents-include"
                  style={buttonStyle('primary')}
                >
                  Включить
                </button>
              </div>
            ))}
          </section>
        </div>
      )}
    </div>
  )
}
