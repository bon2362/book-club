import { CollectionError } from './errors'
import {
  COLLECTION_LIMITS,
  type AdminCollectionAction,
  type CollectionAction,
  type CollectionRecord,
  type CollectionSnapshot,
  type CollectionStatus,
  type CollectionViewer,
} from './types'

type Owned = Pick<CollectionRecord, 'authorUserId' | 'status'>

export function isCollectionOwner(record: Pick<CollectionRecord, 'authorUserId'>, viewer: CollectionViewer): boolean {
  return viewer.userId !== null && viewer.userId === record.authorUserId
}

export function canViewCollection(record: Owned, viewer: CollectionViewer): boolean {
  return record.status === 'published' || viewer.isAdmin || isCollectionOwner(record, viewer)
}

export function canEditCollection(record: Owned, viewer: CollectionViewer): boolean {
  return viewer.isAdmin || isCollectionOwner(record, viewer)
}

/** Автор удаляет только неопубликованную подборку: удаление опубликованной ломает ссылки в чатах. */
export function canDeleteCollection(record: Owned, viewer: CollectionViewer): boolean {
  if (viewer.isAdmin) return true
  return isCollectionOwner(record, viewer) && record.status !== 'published'
}

export function normalizeBookIds(bookIds: readonly string[]): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of bookIds) {
    const id = raw.trim()
    if (!id || seen.has(id)) continue
    seen.add(id)
    result.push(id)
  }
  return result
}

export type CollectionValidationIssue =
  | 'title_required'
  | 'title_too_long'
  | 'description_required'
  | 'description_too_long'
  | 'display_name_required'
  | 'display_name_too_long'
  | 'too_few_books'
  | 'too_many_books'
  | 'duplicate_books'

export function validateCollectionContent(
  content: CollectionSnapshot,
  mode: 'save' | 'submit',
  publicBookIds: ReadonlySet<string> = new Set(),
): CollectionValidationIssue[] {
  const issues: CollectionValidationIssue[] = []
  const title = content.title.trim()
  const displayName = content.displayName.trim()

  if (!title) issues.push('title_required')
  if (title.length > COLLECTION_LIMITS.titleMax) issues.push('title_too_long')
  if (content.descriptionMarkdown.length > COLLECTION_LIMITS.descriptionMax) issues.push('description_too_long')
  if (displayName.length > COLLECTION_LIMITS.displayNameMax) issues.push('display_name_too_long')
  if (content.bookIds.length > COLLECTION_LIMITS.booksMax) issues.push('too_many_books')
  if (normalizeBookIds(content.bookIds).length !== content.bookIds.length) issues.push('duplicate_books')

  if (mode === 'submit') {
    if (!content.descriptionMarkdown.trim()) issues.push('description_required')
    if (!displayName) issues.push('display_name_required')
    const publicCount = content.bookIds.filter((id) => publicBookIds.has(id)).length
    if (publicCount < COLLECTION_LIMITS.booksMinToSubmit) issues.push('too_few_books')
  }
  return issues
}

export function snapshotOf(content: CollectionSnapshot): CollectionSnapshot {
  return {
    title: content.title,
    descriptionMarkdown: content.descriptionMarkdown,
    displayName: content.displayName,
    bookIds: [...content.bookIds],
  }
}

export type CollectionEditKind = 'none' | 'order_only' | 'content'

export function classifyCollectionEdit(prev: CollectionSnapshot, next: CollectionSnapshot): CollectionEditKind {
  const textChanged = prev.title !== next.title
    || prev.descriptionMarkdown !== next.descriptionMarkdown
    || prev.displayName !== next.displayName
  const prevSet = new Set(prev.bookIds)
  const setChanged = prev.bookIds.length !== next.bookIds.length || next.bookIds.some((id) => !prevSet.has(id))
  if (textChanged || setChanged) return 'content'
  return prev.bookIds.some((id, index) => next.bookIds[index] !== id) ? 'order_only' : 'none'
}

export function isChangedSinceReview(record: Pick<CollectionRecord, 'status' | 'editedAt' | 'reviewedAt'>): boolean {
  if (record.status !== 'published' || !record.editedAt) return false
  return !record.reviewedAt || record.editedAt.getTime() > record.reviewedAt.getTime()
}

/** «Свежие первыми»: последняя публикация или правка автором текста и состава (не проверка модератором). */
export function collectionSortAt(record: Pick<CollectionRecord, 'publishedAt' | 'editedAt'>): Date | null {
  const times = [record.publishedAt, record.editedAt].filter((date): date is Date => date !== null)
  if (times.length === 0) return null
  return new Date(Math.max(...times.map((date) => date.getTime())))
}

const TRANSITIONS: Record<CollectionAction, { from: readonly CollectionStatus[]; to: CollectionStatus }> = {
  submit: { from: ['draft', 'rejected', 'hidden'], to: 'pending' },
  publish: { from: ['pending'], to: 'published' },
  reject: { from: ['pending'], to: 'rejected' },
  mark_reviewed: { from: ['published'], to: 'published' },
  hide: { from: ['published'], to: 'hidden' },
  unhide: { from: ['hidden'], to: 'published' },
}

export function nextCollectionStatus(status: CollectionStatus, action: CollectionAction): CollectionStatus {
  const transition = TRANSITIONS[action]
  if (!transition.from.includes(status)) {
    throw new CollectionError('invalid_transition', { status, action })
  }
  return transition.to
}

export function actionRequiresReason(action: CollectionAction): boolean {
  return action === 'reject' || action === 'hide'
}

export interface CollectionContentPatch {
  title: string
  descriptionMarkdown: string
  displayName: string
  updatedAt: Date
  editedAt?: Date
  reviewedAt?: Date
  reviewedSnapshot?: CollectionSnapshot
}

export function planContentSave(
  current: CollectionRecord,
  next: CollectionSnapshot,
  by: 'author' | 'admin',
  now: Date,
): { kind: CollectionEditKind; patch: CollectionContentPatch } {
  const normalized: CollectionSnapshot = {
    title: next.title.trim(),
    descriptionMarkdown: next.descriptionMarkdown,
    displayName: next.displayName.trim(),
    bookIds: normalizeBookIds(next.bookIds),
  }
  const kind = classifyCollectionEdit(snapshotOf(current), normalized)
  const patch: CollectionContentPatch = {
    title: normalized.title,
    descriptionMarkdown: normalized.descriptionMarkdown,
    displayName: normalized.displayName,
    updatedAt: now,
  }
  // Перестановка не трогает editedAt: не отправляет подборку в очередь и не поднимает её в списках.
  if (by === 'author' && kind === 'content') patch.editedAt = now
  // Правка владельцем опубликованной подборки сама является проверкой.
  if (by === 'admin' && current.status === 'published') {
    patch.reviewedAt = now
    patch.reviewedSnapshot = normalized
  }
  return { kind, patch }
}

export interface CollectionStatusPatch {
  status: CollectionStatus
  updatedAt: Date
  moderationReason?: string | null
  submittedAt?: Date
  publishedAt?: Date
  reviewedAt?: Date
  reviewedSnapshot?: CollectionSnapshot
  slug?: string
}

export function planSubmit(current: CollectionRecord, now: Date, publicBookIds: ReadonlySet<string>): CollectionStatusPatch {
  const status = nextCollectionStatus(current.status, 'submit')
  const issues = validateCollectionContent(snapshotOf(current), 'submit', publicBookIds)
  if (issues.length > 0) throw new CollectionError('validation', { issues })
  return { status, submittedAt: now, updatedAt: now }
}

export function planAdminAction(
  current: CollectionRecord,
  action: AdminCollectionAction,
  input: { reason: string | null; now: Date; slug: string | null },
): CollectionStatusPatch {
  const status = nextCollectionStatus(current.status, action)
  const reason = input.reason?.trim() ?? ''
  if (actionRequiresReason(action) && !reason) {
    throw new CollectionError('validation', { issues: ['reason_required'] })
  }

  const patch: CollectionStatusPatch = { status, updatedAt: input.now }
  if (action === 'publish' || action === 'unhide') {
    patch.moderationReason = null
    patch.publishedAt = input.now
    patch.reviewedAt = input.now
    patch.reviewedSnapshot = snapshotOf(current)
    if (!current.slug) {
      if (!input.slug) throw new Error('slug is required for the first publication')
      patch.slug = input.slug
    }
  } else if (action === 'reject' || action === 'hide') {
    patch.moderationReason = reason
  } else {
    // «Правка проверена»: editedAt остаётся — reviewedAt становится позже него, и подборка
    // уходит из очереди, но сохраняет место в «свежие первыми» по времени правки автора.
    patch.reviewedAt = input.now
    patch.reviewedSnapshot = snapshotOf(current)
  }
  return patch
}
