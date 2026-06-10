'use client'

import { Fragment, useEffect, useState } from 'react'
import { SYSTEM_TRIGGER_TABLES } from '@/lib/audit/audited-tables'

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

export default function AdminAuditLog() {
  const [events, setEvents] = useState<AuditEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/admin/audit-log')
      .then((r) => r.json())
      .then((d) => setEvents(d.events ?? []))
      .finally(() => setLoading(false))
  }, [])

  if (loading) return <p style={{ color: 'var(--text-muted)' }}>Загрузка…</p>

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', background: 'var(--bg-input)', border: '1px solid var(--border)' }}>
      <thead>
        <tr>
          {['Время', 'Кто', 'Источник', 'Действие', 'Объект', 'ID'].map((h) => (
            <th key={h} style={{ textAlign: 'left', padding: '0.5rem', borderBottom: '1px solid var(--border)', fontFamily: 'var(--nd-sans)' }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {events.map((e) => (
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
        ))}
      </tbody>
    </table>
  )
}
