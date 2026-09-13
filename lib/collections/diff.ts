import type { CollectionSnapshot, DiffSummary } from './types'

export interface FieldChange { before: string; after: string }
export interface CollectionDiff { added: string[]; removed: string[]; moved: Array<{ bookId: string; from: number; to: number }>; title: FieldChange | null; description: FieldChange | null; displayName: FieldChange | null }
export type { DiffSummary }
const field = (before: string, after: string): FieldChange | null => before === after ? null : { before, after }
export function diffCollection(before: CollectionSnapshot, after: CollectionSnapshot): CollectionDiff {
  const beforeSet = new Set(before.bookIds); const afterSet = new Set(after.bookIds)
  const commonBefore = before.bookIds.filter(id => afterSet.has(id)); const commonAfter = after.bookIds.filter(id => beforeSet.has(id))
  return { added: after.bookIds.filter(id => !beforeSet.has(id)), removed: before.bookIds.filter(id => !afterSet.has(id)), moved: commonAfter.filter((id, index) => commonBefore[index] !== id).map(id => ({ bookId: id, from: before.bookIds.indexOf(id) + 1, to: after.bookIds.indexOf(id) + 1 })), title: field(before.title, after.title), description: field(before.descriptionMarkdown, after.descriptionMarkdown), displayName: field(before.displayName, after.displayName) }
}
export const summarizeDiff = (diff: CollectionDiff): DiffSummary => ({ added: diff.added.length, removed: diff.removed.length, textChanged: Boolean(diff.title || diff.description || diff.displayName), orderChanged: diff.moved.length > 0 })
