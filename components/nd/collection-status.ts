import type { CollectionStatus } from '@/lib/collections/types'

export const COLLECTION_STATUS_LABEL: Record<CollectionStatus, string> = {
  draft: 'Черновик',
  pending: 'На проверке',
  published: 'Опубликована',
  rejected: 'Отклонена',
  hidden: 'Скрыта',
}

export const COLLECTION_STATUS_COLOR: Record<CollectionStatus, string> = {
  draft: 'var(--text-muted)',
  pending: 'var(--text)',
  published: 'var(--success)',
  rejected: 'var(--accent)',
  hidden: 'var(--text-secondary)',
}

export const COLLECTION_REASON_PREFIX: Partial<Record<CollectionStatus, string>> = {
  rejected: 'Почему не опубликовали:',
  hidden: 'Почему скрыли:',
}
