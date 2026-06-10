'use client'

import { Fragment, useEffect, useState } from 'react'
import { AUDITED_TABLES, SYSTEM_TRIGGER_TABLES } from '@/lib/audit/audited-tables'

interface AuditEvent {
  id: string
  occurredAt: string
  actorUserId: string | null
  actorLabel: string | null
  source: string
  action: string
  entityType: string
  entityId: string | null
  before: unknown
  after: unknown
  changedFields: string[] | null
  reason: string | null
}

type SortBy = 'occurredAt' | 'source' | 'action' | 'entityType' | 'entityId' | 'actorLabel'
type SortDir = 'asc' | 'desc'

interface Filters {
  source: string
  entityType: string
  actorUserId: string
  entityId: string
  from: string
  to: string
}

const PAGE_SIZE = 50

const SOURCES = [
  'admin', 'profile', 'matching', 'catalog', 'signup', 'submission',
  'feedback', 'priorities', 'matching_priority_gate', 'cron', 'auth', 'trigger',
]

const COLUMNS: { label: string; sortBy: SortBy }[] = [
  { label: 'Время', sortBy: 'occurredAt' },
  { label: 'Кто', sortBy: 'actorLabel' },
  { label: 'Источник', sortBy: 'source' },
  { label: 'Действие', sortBy: 'action' },
  { label: 'Объект', sortBy: 'entityType' },
  { label: 'ID', sortBy: 'entityId' },
]

const EMPTY_FILTERS: Filters = { source: '', entityType: '', actorUserId: '', entityId: '', from: '', to: '' }

export default function AdminAuditLog() {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [page, setPage] = useState(1)
  const [sortBy, setSortBy] = useState<SortBy>('occurredAt')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS)

  useEffect(() => {
    setLoading(true)
    const qs = new URLSearchParams()
    qs.set('page', String(page))
    qs.set('pageSize', String(PAGE_SIZE))
    qs.set('sortBy', sortBy)
    qs.set('sortDir', sortDir)
    if (filters.source) qs.set('source', filters.source)
    if (filters.entityType) qs.set('entityType', filters.entityType)
    if (filters.actorUserId) qs.set('actorUserId', filters.actorUserId)
    if (filters.entityId) qs.set('entityId', filters.entityId)
    if (filters.from) qs.set('from', filters.from)
    if (filters.to) qs.set('to', filters.to)

    fetch(`/api/admin/audit-log?${qs.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        setEvents(d.events ?? [])
        setTotal(d.total ?? 0)
      })
      .finally(() => setLoading(false))
  }, [page, sortBy, sortDir, filters])

  function handleSort(col: SortBy) {
    if (col === sortBy) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortBy(col)
      setSortDir('desc')
    }
    setPage(1)
  }

  function handleFilterChange(key: keyof Filters, value: string) {
    setFilters((f) => ({ ...f, [key]: value }))
    setPage(1)
  }

  function handleReset() {
    setFilters(EMPTY_FILTERS)
    setPage(1)
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  const inputStyle: React.CSSProperties = {
    fontFamily: 'var(--nd-sans)',
    fontSize: '0.85rem',
    border: '1px solid var(--border)',
    background: 'var(--bg-input)',
    color: 'var(--text)',
    padding: '0.3rem 0.5rem',
    outline: 'none',
  }

  const thStyle: React.CSSProperties = {
    textAlign: 'left',
    padding: '0.5rem',
    borderBottom: '1px solid var(--border)',
    fontFamily: 'var(--nd-sans)',
    cursor: 'pointer',
    userSelect: 'none',
    whiteSpace: 'nowrap',
  }

  return (
    <div>
      {/* Filters */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '1rem', alignItems: 'flex-end' }}>
        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontFamily: 'var(--nd-sans)', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
          Источник
          <select value={filters.source} onChange={(e) => handleFilterChange('source', e.target.value)} style={inputStyle}>
            <option value="">Все</option>
            {SOURCES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontFamily: 'var(--nd-sans)', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
          Объект
          <select value={filters.entityType} onChange={(e) => handleFilterChange('entityType', e.target.value)} style={inputStyle}>
            <option value="">Все</option>
            {AUDITED_TABLES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontFamily: 'var(--nd-sans)', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
          Актор (userId)
          <input
            type="text"
            value={filters.actorUserId}
            onChange={(e) => handleFilterChange('actorUserId', e.target.value)}
            placeholder="user id"
            style={{ ...inputStyle, width: '140px' }}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontFamily: 'var(--nd-sans)', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
          ID объекта
          <input
            type="text"
            value={filters.entityId}
            onChange={(e) => handleFilterChange('entityId', e.target.value)}
            placeholder="entity id"
            style={{ ...inputStyle, width: '140px' }}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontFamily: 'var(--nd-sans)', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
          С
          <input
            type="date"
            value={filters.from}
            onChange={(e) => handleFilterChange('from', e.target.value)}
            style={{ ...inputStyle, width: '130px' }}
          />
        </label>

        <label style={{ display: 'flex', flexDirection: 'column', gap: '0.2rem', fontFamily: 'var(--nd-sans)', fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.12em' }}>
          По
          <input
            type="date"
            value={filters.to}
            onChange={(e) => handleFilterChange('to', e.target.value)}
            style={{ ...inputStyle, width: '130px' }}
          />
        </label>

        <button
          onClick={handleReset}
          style={{
            fontFamily: 'var(--nd-sans)',
            fontSize: '0.85rem',
            border: '1px solid var(--border)',
            background: 'transparent',
            color: 'var(--text-muted)',
            padding: '0.3rem 0.75rem',
            cursor: 'pointer',
          }}
        >
          Сбросить
        </button>
      </div>

      {loading ? (
        <p style={{ color: 'var(--text-muted)' }}>Загрузка…</p>
      ) : (
        <>
          <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
            <thead>
              <tr>
                {COLUMNS.map((col) => (
                  <th
                    key={col.sortBy}
                    onClick={() => handleSort(col.sortBy)}
                    style={{
                      ...thStyle,
                      color: sortBy === col.sortBy ? 'var(--text)' : 'var(--text-muted)',
                    }}
                  >
                    {col.label}
                    {sortBy === col.sortBy && (
                      <span style={{ marginLeft: '0.3em' }}>{sortDir === 'asc' ? '▲' : '▼'}</span>
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {events.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '0.75rem', color: 'var(--text-muted)', fontFamily: 'var(--nd-sans)' }}>
                    Нет записей
                  </td>
                </tr>
              ) : (
                events.map((e) => (
                  <Fragment key={e.id}>
                    <tr data-testid="audit-row" onClick={() => setExpanded(expanded === e.id ? null : e.id)} style={{ cursor: 'pointer', borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '0.5rem' }}>{new Date(e.occurredAt).toLocaleString('ru-RU')}</td>
                      <td style={{ padding: '0.5rem' }}>
                        {e.source === 'trigger'
                          ? (SYSTEM_TRIGGER_TABLES as readonly string[]).includes(e.entityType)
                            ? <span style={{ color: 'var(--text-muted)' }}>система</span>
                            : <span style={{ color: 'var(--accent)' }}>внесистемное</span>
                          : (e.actorLabel ?? e.actorUserId ?? '—')}
                      </td>
                      <td style={{ padding: '0.5rem' }}>{e.source}</td>
                      <td style={{ padding: '0.5rem' }}>{e.action}</td>
                      <td style={{ padding: '0.5rem' }}>{e.entityType}</td>
                      <td style={{ padding: '0.5rem' }}>{e.entityId ?? '—'}</td>
                    </tr>
                    {expanded === e.id && (
                      <tr data-testid="audit-detail">
                        <td colSpan={6} style={{ padding: '0.5rem', background: 'var(--bg)' }}>
                          <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'var(--nd-sans)', fontSize: '0.8rem' }}>
                            {JSON.stringify({ before: e.before, after: e.after, changedFields: e.changedFields, reason: e.reason }, null, 2)}
                          </pre>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>

          {/* Pagination */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.75rem', fontFamily: 'var(--nd-sans)', fontSize: '0.85rem', color: 'var(--text-muted)' }}>
            <button
              onClick={() => setPage((p) => p - 1)}
              disabled={page <= 1}
              style={{
                fontFamily: 'var(--nd-sans)',
                fontSize: '0.85rem',
                border: '1px solid var(--border)',
                background: 'transparent',
                color: page <= 1 ? 'var(--text-muted)' : 'var(--text)',
                padding: '0.3rem 0.75rem',
                cursor: page <= 1 ? 'default' : 'pointer',
                opacity: page <= 1 ? 0.5 : 1,
              }}
            >
              ← Назад
            </button>
            <span>стр. {page} из {totalPages}, всего {total}</span>
            <button
              onClick={() => setPage((p) => p + 1)}
              disabled={page * PAGE_SIZE >= total}
              style={{
                fontFamily: 'var(--nd-sans)',
                fontSize: '0.85rem',
                border: '1px solid var(--border)',
                background: 'transparent',
                color: page * PAGE_SIZE >= total ? 'var(--text-muted)' : 'var(--text)',
                padding: '0.3rem 0.75rem',
                cursor: page * PAGE_SIZE >= total ? 'default' : 'pointer',
                opacity: page * PAGE_SIZE >= total ? 0.5 : 1,
              }}
            >
              Вперёд →
            </button>
          </div>
        </>
      )}
    </div>
  )
}
