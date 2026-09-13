'use client'

import { useCallback, useEffect, useState } from 'react'
import type { MyCollectionItem } from '@/lib/collections/types'
import { collectionIssueText, formatChangedAt, textsCount } from '@/lib/collections/format'
import { track } from '@/lib/analytics'
import CoverImage from './CoverImage'
import { COLLECTION_REASON_PREFIX, COLLECTION_STATUS_COLOR, COLLECTION_STATUS_LABEL } from './collection-status'

export default function ProfileCollectionsTab() {
  const [items, setItems] = useState<MyCollectionItem[] | null>(null)
  const [issuesById, setIssuesById] = useState<Record<string, string[]>>({})

  const load = useCallback(async () => {
    const response = await fetch('/api/me/collections')
    const body = await response.json()
    setItems(response.ok ? body.collections : [])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  async function submit(id: string) {
    const response = await fetch(`/api/me/collections/${id}/submit`, { method: 'POST' })
    const body = await response.json()
    if (!response.ok) {
      setIssuesById((current) => ({ ...current, [id]: Array.isArray(body.issues) ? body.issues : [body.error] }))
      return
    }
    track('collection_submitted', { collection_id: id, source: 'profile' })
    setIssuesById((current) => ({ ...current, [id]: [] }))
    await load()
  }

  if (items === null) {
    return <div style={{ padding: '1.25rem 1.5rem', fontSize: 12, color: 'var(--text-muted)' }}>Загружаю…</div>
  }

  const createButton = (
    <a href="/collections/new" className="p-btn block sm" style={{ textAlign: 'center' }}>Собрать подборку</a>
  )

  if (items.length === 0) {
    return (
      <div style={{ padding: '1.25rem 1.5rem' }}>
        <div style={{ border: '1px dashed var(--border)', padding: '30px 22px', textAlign: 'center' }}>
          <p style={{ fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.6, margin: '0 0 14px' }}>
            Вы ещё не собирали подборок. Если дочитали книгу с кругом и знаете, что читать дальше, — соберите набросок.
          </p>
          {createButton}
        </div>
      </div>
    )
  }

  const now = new Date()

  return (
    <div style={{ padding: '1.25rem 1.5rem' }} data-testid="profile-collections">
      <p style={{ fontSize: 12, lineHeight: 1.5, color: 'var(--text-secondary)', margin: '0 0 14px' }}>
        Опубликованные подборки правятся без проверки
      </p>
      {createButton}

      <div style={{ marginTop: 14 }}>
        {items.map((item, index) => {
          const reasonPrefix = COLLECTION_REASON_PREFIX[item.status]
          const when = item.status === 'pending' && item.submittedAt
            ? `отправлена ${formatChangedAt(new Date(item.submittedAt), now).absolute}`
            : `изменена ${formatChangedAt(new Date(item.changedAt), now).relative}`

          return (
            <div
              key={item.id}
              data-testid="profile-collection-row"
              style={{ borderTop: `1px solid ${index === 0 ? 'var(--border-strong)' : 'var(--border)'}`, padding: '14px 0' }}
            >
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span
                  style={{
                    fontSize: '0.6rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.12em',
                    color: COLLECTION_STATUS_COLOR[item.status],
                    borderBottom: '1px solid currentColor',
                    paddingBottom: 2,
                  }}
                >
                  {COLLECTION_STATUS_LABEL[item.status]}
                </span>
                <span style={{ fontSize: 10.4, color: 'var(--text-muted)' }}>{when}</span>
              </div>

              <div style={{ fontFamily: 'var(--nd-serif)', fontWeight: 700, fontSize: 15, lineHeight: 1.24, margin: '7px 0 5px' }}>
                {item.title}
              </div>
              <div style={{ fontSize: 10.4, color: 'var(--text-muted)' }}>{textsCount(item.textsCount)}</div>

              {item.covers.length > 0 && (
                <div style={{ display: 'flex', gap: 3, marginTop: 9 }}>
                  {item.covers.map((cover) => (
                    <span key={cover.id} style={{ position: 'relative', width: 20, aspectRatio: '2 / 3', overflow: 'hidden' }}>
                      <CoverImage coverUrl={cover.coverUrl} title={cover.title} author={cover.author} />
                    </span>
                  ))}
                </div>
              )}

              {reasonPrefix && item.moderationReason && (
                <div
                  style={{
                    marginTop: 10,
                    borderLeft: '2px solid var(--accent)',
                    paddingLeft: 10,
                    fontSize: 11.5,
                    lineHeight: 1.5,
                    color: 'var(--text-body)',
                  }}
                >
                  <b style={{ fontWeight: 500 }}>{reasonPrefix}</b> {item.moderationReason}
                </div>
              )}

              {(issuesById[item.id] ?? []).map((issue) => (
                <div key={issue} style={{ marginTop: 6, fontSize: 11.5, color: 'var(--accent)' }}>
                  {collectionIssueText(issue)}
                </div>
              ))}

              <div style={{ display: 'flex', gap: 7, marginTop: 11, flexWrap: 'wrap' }}>
                <a className="p-btn ghost sm" href={`/collections/${item.id}/edit`}>Править</a>
                {item.status === 'published' && item.slug && (
                  <a className="p-btn ghost sm" href={`/collections/${item.slug}`}>Открыть</a>
                )}
                {item.status === 'draft' && (
                  <button type="button" className="p-btn sm" onClick={() => void submit(item.id)}>Отправить</button>
                )}
                {(item.status === 'rejected' || item.status === 'hidden') && (
                  <button type="button" className="p-btn sm" onClick={() => void submit(item.id)}>Отправить снова</button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
