export const COLLECTION_STATUSES = ['draft', 'pending', 'published', 'rejected', 'hidden'] as const
export type CollectionStatus = (typeof COLLECTION_STATUSES)[number]

export const ADMIN_COLLECTION_ACTIONS = ['publish', 'reject', 'mark_reviewed', 'hide', 'unhide'] as const
export type AdminCollectionAction = (typeof ADMIN_COLLECTION_ACTIONS)[number]
export type CollectionAction = 'submit' | AdminCollectionAction

export const COLLECTION_LIMITS = {
  titleMax: 120,
  displayNameMax: 60,
  descriptionMax: 5000,
  booksMinToSubmit: 2,
  booksMax: 50,
} as const

export interface CollectionSnapshot {
  title: string
  descriptionMarkdown: string
  displayName: string
  bookIds: string[]
}

export interface CollectionRecord extends CollectionSnapshot {
  id: string
  slug: string | null
  authorUserId: string
  status: CollectionStatus
  moderationReason: string | null
  submittedAt: Date | null
  editedAt: Date | null
  publishedAt: Date | null
  reviewedAt: Date | null
  reviewedSnapshot: CollectionSnapshot | null
  createdAt: Date
  updatedAt: Date
}

type CollectionDateKey = 'submittedAt' | 'editedAt' | 'publishedAt' | 'reviewedAt' | 'createdAt' | 'updatedAt'

export interface SerializedCollection extends Omit<CollectionRecord, CollectionDateKey> {
  submittedAt: string | null
  editedAt: string | null
  publishedAt: string | null
  reviewedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface CollectionViewer {
  userId: string | null
  isAdmin: boolean
}

/** Сводка разницы для очереди модерации; сама разница — lib/collections/diff.ts. */
export interface DiffSummary {
  added: number
  removed: number
  textChanged: boolean
  orderChanged: boolean
}

export interface CollectionCoverBook {
  id: string
  title: string
  author: string
  coverUrl: string | null
}

export interface CollectionListItem {
  id: string
  slug: string
  title: string
  textsCount: number
  covers: CollectionCoverBook[]
  sortAt: string
}

export interface MyCollectionItem {
  id: string
  slug: string | null
  title: string
  status: CollectionStatus
  moderationReason: string | null
  textsCount: number
  covers: CollectionCoverBook[]
  changedAt: string
  submittedAt: string | null
}

export interface CollectionBookSearchResult extends CollectionCoverBook {
  year: string
  isArticle: boolean
  clubStatus: 'reading' | 'read' | null
}

export interface EditorBook extends CollectionBookSearchResult {
  hiddenFromCatalog: boolean
}

export interface AdminQueueItem {
  id: string
  slug: string | null
  title: string
  displayName: string
  status: CollectionStatus
  textsCount: number
  covers: CollectionCoverBook[]
  at: string
  /** Только у подборок, изменённых после последней проверки. */
  diffSummary: DiffSummary | null
}

export interface AdminCollectionQueue {
  pending: AdminQueueItem[]
  changed: AdminQueueItem[]
  published: AdminQueueItem[]
  rejectedOrHidden: AdminQueueItem[]
}
