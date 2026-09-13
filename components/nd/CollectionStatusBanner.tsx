import type { CollectionStatus } from '@/lib/collections/types'
import { COLLECTION_REASON_PREFIX, COLLECTION_STATUS_LABEL } from './collection-status'

interface Props {
  status: CollectionStatus
  reason: string | null
}

export default function CollectionStatusBanner({ status, reason }: Props) {
  const prefix = COLLECTION_REASON_PREFIX[status]
  return (
    <div
      data-testid="collection-status-banner"
      style={{
        display: 'flex',
        gap: 12,
        alignItems: 'flex-start',
        padding: '13px 16px',
        margin: '18px 0 0',
        border: '1px solid var(--border)',
        borderLeft: '2px solid var(--accent)',
        background: 'var(--bg-tint)',
      }}
    >
      <span
        style={{
          flexShrink: 0,
          fontSize: '0.6rem',
          textTransform: 'uppercase',
          letterSpacing: '0.12em',
          color: 'var(--accent)',
          borderBottom: '1px solid currentColor',
          paddingBottom: 2,
        }}
      >
        {COLLECTION_STATUS_LABEL[status]}
      </span>
      <div style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-body)' }}>
        Подборка не опубликована. Её видите вы как автор и модератор — по ссылке другим она недоступна.
        {prefix && reason && (
          <div style={{ marginTop: 6 }}>
            <b style={{ fontWeight: 500 }}>{prefix}</b> {reason}
          </div>
        )}
      </div>
    </div>
  )
}
