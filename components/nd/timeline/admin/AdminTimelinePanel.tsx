'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import EpochForm from './EpochForm'
import EventForm from './EventForm'
import EventTypeForm from './EventTypeForm'
import TimelineContents from './TimelineContents'
import TimelineForm from './TimelineForm'
import {
  SANS,
  SERIF,
  type AdminEpochRow,
  type AdminEventRow,
  type AdminEventType,
  type AdminTimelineSummary,
  buttonStyle,
  errorStyle,
  formatDateLabel,
  formatRangeLabel,
  readError,
  rowStyle,
} from './shared'

/**
 * Вкладка «Ленты времени» в панели администратора.
 *
 * Четыре списка — события, эпохи, типы и сами ленты — с переключением между
 * ними. Формы и экран сборки вынесены в отдельные компоненты:
 * `AdminBooksCatalog` разросся до полутора тысяч строк ровно потому, что всё
 * жило в одном файле.
 */

type Section = 'events' | 'epochs' | 'types' | 'timelines'

const SECTIONS: { key: Section; label: string }[] = [
  { key: 'events', label: 'События' },
  { key: 'epochs', label: 'Эпохи' },
  { key: 'types', label: 'Типы событий' },
  { key: 'timelines', label: 'Ленты' },
]

type Editing =
  | { kind: 'event'; row: AdminEventRow | null }
  | { kind: 'epoch'; row: AdminEpochRow | null }
  | { kind: 'type'; row: AdminEventType | null }
  | { kind: 'timeline'; row: AdminTimelineSummary | null }
  | null

async function loadList<T>(url: string): Promise<T[]> {
  const res = await fetch(url)
  const message = await readError(res)
  if (message) throw new Error(message)
  const json = (await res.json()) as { data: T[] }
  return json.data ?? []
}

export default function AdminTimelinePanel() {
  const [section, setSection] = useState<Section>('events')
  const [types, setTypes] = useState<AdminEventType[]>([])
  const [events, setEvents] = useState<AdminEventRow[]>([])
  const [epochs, setEpochs] = useState<AdminEpochRow[]>([])
  const [timelines, setTimelines] = useState<AdminTimelineSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Editing>(null)
  /** Открытый экран состава ленты — id ленты или null. */
  const [contentsOf, setContentsOf] = useState<string | null>(null)

  const reload = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [typeRows, eventRows, epochRows, timelineRows] = await Promise.all([
        loadList<AdminEventType>('/api/admin/timeline/event-types'),
        loadList<AdminEventRow>('/api/admin/timeline/events'),
        loadList<AdminEpochRow>('/api/admin/timeline/epochs'),
        loadList<AdminTimelineSummary>('/api/admin/timeline/timelines'),
      ])
      setTypes(typeRows)
      setEvents(eventRows)
      setEpochs(epochRows)
      setTimelines(timelineRows)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить данные')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void reload() }, [reload])

  const afterSave = useCallback(() => {
    setEditing(null)
    void reload()
  }, [reload])

  async function togglePublished(timeline: AdminTimelineSummary) {
    setError(null)
    const res = await fetch(`/api/admin/timeline/timelines/${timeline.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ published: !timeline.published }),
    })
    const message = await readError(res)
    if (message) { setError(message); return }
    await reload()
  }

  async function removeTimeline(timeline: AdminTimelineSummary) {
    // Подтверждение объясняет, что теряется: сами события и эпохи остаются в
    // общей базе, уходит только подборка.
    const confirmed = window.confirm(
      `Удалить ленту «${timeline.title}»?\n\n` +
        'События и эпохи останутся в общей базе и на других лентах — ' +
        'удалится только сама подборка и ссылка на неё.',
    )
    if (!confirmed) return

    setError(null)
    const res = await fetch(`/api/admin/timeline/timelines/${timeline.id}`, { method: 'DELETE' })
    const message = await readError(res)
    if (message) { setError(message); return }
    await reload()
  }

  if (contentsOf) {
    return (
      <div data-testid="admin-timeline-panel">
        <TimelineContents
          timelineId={contentsOf}
          onBack={() => { setContentsOf(null); void reload() }}
        />
      </div>
    )
  }

  if (editing) {
    const back = () => setEditing(null)
    return (
      <div data-testid="admin-timeline-panel" style={{ maxWidth: '46rem' }}>
        {editing.kind === 'type' && (
          <EventTypeForm editing={editing.row} onSaved={afterSave} onCancel={back} />
        )}
        {editing.kind === 'event' && (
          <EventForm editing={editing.row} types={types} onSaved={afterSave} onCancel={back} />
        )}
        {editing.kind === 'epoch' && (
          <EpochForm editing={editing.row} onSaved={afterSave} onCancel={back} />
        )}
        {editing.kind === 'timeline' && (
          <TimelineForm editing={editing.row} onSaved={afterSave} onCancel={back} />
        )}
      </div>
    )
  }

  return (
    <div data-testid="admin-timeline-panel" style={{ fontFamily: SANS }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        {SECTIONS.map(item => (
          <button
            key={item.key}
            type="button"
            onClick={() => setSection(item.key)}
            data-testid={`timeline-section-${item.key}`}
            style={{
              fontFamily: SANS,
              fontSize: '0.65rem',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              padding: '0.3rem 0',
              background: 'none',
              border: 'none',
              borderBottom: section === item.key ? '2px solid var(--text)' : '2px solid transparent',
              color: section === item.key ? 'var(--text)' : 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            {item.label}
          </button>
        ))}

        <button
          type="button"
          onClick={() =>
            setEditing(
              section === 'events'
                ? { kind: 'event', row: null }
                : section === 'epochs'
                  ? { kind: 'epoch', row: null }
                  : section === 'types'
                    ? { kind: 'type', row: null }
                    : { kind: 'timeline', row: null },
            )
          }
          style={{ ...buttonStyle('primary'), marginLeft: 'auto' }}
          data-testid="timeline-add"
        >
          Добавить
        </button>
      </div>

      {error && <p style={errorStyle} role="alert" data-testid="timeline-panel-error">{error}</p>}

      {loading && (
        <p style={{ fontFamily: SANS, fontSize: '0.8rem', color: 'var(--text-muted)' }}>Загрузка…</p>
      )}

      {!loading && section === 'events' && (
        <div data-testid="timeline-events-list">
          {events.length === 0 && <EmptyHint text="Событий пока нет." />}
          {events.map(row => (
            <button
              key={row.id}
              type="button"
              onClick={() => setEditing({ kind: 'event', row })}
              data-testid="timeline-event-row"
              style={rowStyle}
            >
              <span aria-hidden style={{ color: row.typeColor }}>{row.typeIcon}</span>
              <span style={{ flex: 1 }}>{row.title}</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                {formatRangeLabel(
                  { year: row.startYear, era: row.startEra === 'BCE' ? 'BCE' : 'CE', ...(row.startMonth != null ? { month: row.startMonth } : {}), ...(row.startDay != null ? { day: row.startDay } : {}) },
                  row.endYear != null
                    ? { year: row.endYear, era: row.endEra === 'BCE' ? 'BCE' : 'CE', ...(row.endMonth != null ? { month: row.endMonth } : {}), ...(row.endDay != null ? { day: row.endDay } : {}) }
                    : null,
                  row.ongoing,
                )}
              </span>
              <span style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted)' }}>
                {row.typeTitle}
              </span>
            </button>
          ))}
        </div>
      )}

      {!loading && section === 'epochs' && (
        <div data-testid="timeline-epochs-list">
          {epochs.length === 0 && <EmptyHint text="Эпох пока нет." />}
          {epochs.map(row => (
            <button
              key={row.id}
              type="button"
              onClick={() => setEditing({ kind: 'epoch', row })}
              data-testid="timeline-epoch-row"
              style={rowStyle}
            >
              <span style={{ flex: 1 }}>{row.title}</span>
              <span style={{ fontSize: '0.72rem', color: 'var(--text-secondary)' }}>
                {formatDateLabel({ year: row.startYear, era: row.startEra === 'BCE' ? 'BCE' : 'CE' })}
                {' — '}
                {row.endYear != null
                  ? formatDateLabel({ year: row.endYear, era: row.endEra === 'BCE' ? 'BCE' : 'CE' })
                  : '—'}
              </span>
            </button>
          ))}
        </div>
      )}

      {!loading && section === 'types' && (
        <div data-testid="timeline-types-list">
          {types.length === 0 && <EmptyHint text="Типов событий пока нет." />}
          {types.map(row => (
            <button
              key={row.id}
              type="button"
              onClick={() => setEditing({ kind: 'type', row })}
              data-testid="timeline-type-row"
              style={rowStyle}
            >
              <span aria-hidden style={{ width: '0.9rem', height: '0.9rem', background: row.color, display: 'inline-block' }} />
              <span aria-hidden>{row.icon}</span>
              <span style={{ flex: 1 }}>{row.title}</span>
              <span style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted)' }}>
                событий: {row.usageCount}
              </span>
            </button>
          ))}
        </div>
      )}

      {!loading && section === 'timelines' && (
        <div data-testid="timeline-timelines-list">
          {timelines.length === 0 && <EmptyHint text="Лент пока нет." />}
          {timelines.map(row => (
            <div
              key={row.id}
              data-testid="timeline-timeline-row"
              style={{ ...rowStyle, cursor: 'default' }}
            >
              <button
                type="button"
                onClick={() => setContentsOf(row.id)}
                data-testid="timeline-open-contents"
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
                {row.title}
              </button>
              <span style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.12em', color: 'var(--text-muted)' }}>
                событий: {row.eventCount}
              </span>
              <span
                data-testid="timeline-published-state"
                style={{
                  fontSize: '0.6rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.12em',
                  color: row.published ? 'var(--success)' : 'var(--text-muted)',
                  borderLeft: `2px solid ${row.published ? 'var(--success)' : 'var(--border)'}`,
                  paddingLeft: '0.5rem',
                }}
              >
                {row.published ? 'опубликована' : 'черновик'}
              </span>
              <button
                type="button"
                onClick={() => void togglePublished(row)}
                data-testid="timeline-publish-toggle"
                style={buttonStyle()}
              >
                {row.published ? 'Снять с публикации' : 'Опубликовать'}
              </button>
              <button
                type="button"
                onClick={() => setEditing({ kind: 'timeline', row })}
                data-testid="timeline-edit"
                style={buttonStyle()}
              >
                Править
              </button>
              <button
                type="button"
                onClick={() => void removeTimeline(row)}
                data-testid="timeline-delete"
                style={buttonStyle('danger')}
              >
                Удалить
              </button>
              <Link
                href={`/timeline/${row.slug}`}
                data-testid="timeline-public-link"
                style={{ fontFamily: SANS, fontSize: '0.7rem', color: 'var(--accent)', textDecoration: 'none' }}
              >
                Открыть
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function EmptyHint({ text }: { text: string }) {
  return (
    <p style={{ fontFamily: SERIF, fontSize: '0.9rem', color: 'var(--text-secondary)', margin: '1rem 0' }}>
      {text}
    </p>
  )
}
