'use client'

import { useCallback, useEffect, useState } from 'react'
import type { AdminCollectionQueue, AdminQueueItem } from '@/lib/collections/types'
import { formatChangedAt, formatDiffSummary, textsCount } from '@/lib/collections/format'
import CoverImage from './CoverImage'
import AdminCollectionReview from './AdminCollectionReview'

interface Props {
  initialSelectedId?: string | null
  onCountChange?: (count: number) => void
}

const SECTIONS: Array<{ key: keyof AdminCollectionQueue; title: string; testId: string; accentCount?: boolean }> = [
  { key: 'pending', title: 'Ждут проверки', testId: 'queue-pending', accentCount: true },
  { key: 'changed', title: 'Изменились после проверки', testId: 'queue-changed' },
  { key: 'published', title: 'Опубликованные', testId: 'queue-published' },
  { key: 'rejectedOrHidden', title: 'Отклонённые и скрытые', testId: 'queue-rejected-hidden' },
]

function formatQueueTime(iso: string): string {
  const date = new Date(iso)
  const time = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
  return `${formatChangedAt(date, new Date()).absolute}, ${time}`
}

export default function AdminCollectionsPanel({ initialSelectedId = null, onCountChange }: Props) {
  const [queue, setQueue] = useState<AdminCollectionQueue | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId)
  const [homeBlockEnabled, setHomeBlockEnabled] = useState<boolean | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    const response = await fetch('/api/admin/collections')
    const body = await response.json()
    if (!response.ok) {
      setError(body.error === 'migration_required'
        ? 'Подборки ещё не включены: примените миграцию 0066.'
        : 'Не удалось загрузить подборки.')
      return
    }
    const next = body.queue as AdminCollectionQueue
    setQueue(next)
    onCountChange?.(next.pending.length + next.changed.length)
    setSelectedId((current) => {
      const all = SECTIONS.flatMap((section) => next[section.key])
      if (current && all.some((item) => item.id === current)) return current
      return all[0]?.id ?? null
    })
  }, [onCountChange])

  useEffect(() => {
    void load()
    void fetch('/api/admin/collections/settings').then(async (response) => {
      if (response.ok) setHomeBlockEnabled((await response.json()).homeBlockEnabled)
    })
  }, [load])

  async function toggleHomeBlock() {
    if (homeBlockEnabled === null) return
    const response = await fetch('/api/admin/collections/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ homeBlockEnabled: !homeBlockEnabled }),
    })
    if (response.ok) setHomeBlockEnabled((await response.json()).homeBlockEnabled)
  }

  function renderItem(item: AdminQueueItem) {
    const selected = item.id === selectedId
    const summary = item.diffSummary ? formatDiffSummary(item.diffSummary) : ''
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => setSelectedId(item.id)}
        data-testid="queue-item"
        style={{
          display: 'block',
          width: '100%',
          textAlign: 'left',
          padding: '13px 16px',
          cursor: 'pointer',
          fontFamily: 'var(--nd-sans)',
          border: 'none',
          borderBottom: '1px solid var(--border)',
          borderLeft: `2px solid ${selected ? 'var(--accent)' : 'transparent'}`,
          background: selected ? 'var(--bg-tint)' : 'transparent',
        }}
      >
        <div style={{ fontFamily: 'var(--nd-serif)', fontWeight: 700, fontSize: 15, lineHeight: 1.2, color: 'var(--text)' }}>
          {item.title}
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 5 }}>
          {item.displayName || '—'} · {formatQueueTime(item.at)} ·{' '}
          {summary ? <span style={{ color: 'var(--accent)' }}>{summary}</span> : textsCount(item.textsCount)}
        </div>
        {item.status === 'pending' && item.covers.length > 0 && (
          <div style={{ display: 'flex', gap: 3, marginTop: 9 }}>
            {item.covers.map((cover) => (
              <span key={cover.id} style={{ position: 'relative', width: 20, aspectRatio: '2 / 3', overflow: 'hidden' }}>
                <CoverImage coverUrl={cover.coverUrl} title={cover.title} author={cover.author} />
              </span>
            ))}
          </div>
        )}
      </button>
    )
  }

  return (
    <div data-testid="admin-collections">
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
        <button
          type="button"
          aria-pressed={homeBlockEnabled === true}
          disabled={homeBlockEnabled === null}
          onClick={toggleHomeBlock}
          className={homeBlockEnabled ? 'p-btn sm' : 'p-btn ghost sm'}
        >
          Блок подборок на главной: {homeBlockEnabled ? 'включён' : 'выключен'}
        </button>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          Ссылка «Подборки» в шапке и страницы подборок работают всегда.
        </span>
      </div>

      {error && <p style={{ fontSize: 12, color: 'var(--accent)' }}>{error}</p>}

      {queue && (
        <div
          className="admin-collections-grid"
          style={{ display: 'grid', gridTemplateColumns: '330px 1fr', minHeight: 600, border: '1px solid var(--border)' }}
        >
          <div className="admin-collections-list" style={{ borderRight: '1px solid var(--border)' }}>
            {SECTIONS.map((section) => (
              <div key={section.key} data-testid={section.testId}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '11px 16px',
                    background: 'var(--bg-elevated)',
                    borderBottom: '1px solid var(--border)',
                  }}
                >
                  <span style={{ fontSize: '0.6rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--text-muted)' }}>
                    {section.title}
                  </span>
                  <span style={{ fontFamily: 'var(--nd-mono)', fontSize: 11, color: section.accentCount ? 'var(--accent)' : 'var(--text-muted)' }}>
                    {queue[section.key].length}
                  </span>
                </div>
                {queue[section.key].length === 0
                  ? <div style={{ padding: '13px 16px', fontSize: 12, color: 'var(--text-muted)' }}>Пусто.</div>
                  : queue[section.key].map(renderItem)}
              </div>
            ))}
          </div>
          <div style={{ padding: '22px 24px' }}>
            {selectedId ? (
              <AdminCollectionReview key={selectedId} id={selectedId} onChanged={load} />
            ) : (
              <div style={{ border: '1px dashed var(--border)', padding: '30px 22px', textAlign: 'center', fontSize: 13, color: 'var(--text-secondary)' }}>
                Очередь пуста. Новые и изменённые подборки появятся здесь.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
