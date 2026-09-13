import { and, asc, eq, ilike, inArray, like, or } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookCollectionItems, bookCollections, books } from '@/lib/db/schema'
import { fetchBooksByIds, type BookWithCover } from '@/lib/books'
import { slugifyTitle, uniqueSlug } from '@/lib/slug'
import { diffCollection, summarizeDiff } from './diff'
import { CollectionError } from './errors'
import {
  canEditCollection,
  canViewCollection,
  collectionSortAt,
  isChangedSinceReview,
  normalizeBookIds,
  planAdminAction,
  planContentSave,
  planSubmit,
  snapshotOf,
  validateCollectionContent,
} from './rules'
import type {
  AdminCollectionAction,
  AdminCollectionQueue,
  AdminQueueItem,
  CollectionBookSearchResult,
  CollectionCoverBook,
  CollectionListItem,
  CollectionRecord,
  CollectionSnapshot,
  CollectionStatus,
  CollectionViewer,
  EditorBook,
  MyCollectionItem,
  SerializedCollection,
} from './types'

type DbLike = typeof db
type CollectionRow = typeof bookCollections.$inferSelect

// `new` занят страницей создания, `book-search` — роутом поиска рядом с [slugOrId].
const RESERVED_SLUGS = new Set(['new', 'book-search'])
const CARD_COVERS = 5
const QUEUE_COVERS = 5
const PROFILE_COVERS = 8

export function serializeCollection(record: CollectionRecord): SerializedCollection {
  const iso = (date: Date | null) => (date ? date.toISOString() : null)
  return {
    ...record,
    submittedAt: iso(record.submittedAt),
    editedAt: iso(record.editedAt),
    publishedAt: iso(record.publishedAt),
    reviewedAt: iso(record.reviewedAt),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  }
}

function toRecord(row: CollectionRow, bookIds: string[]): CollectionRecord {
  return {
    ...row,
    status: row.status as CollectionStatus,
    reviewedSnapshot: (row.reviewedSnapshot as CollectionSnapshot | null) ?? null,
    bookIds,
  }
}

async function withBookIds(client: DbLike, rows: CollectionRow[]): Promise<CollectionRecord[]> {
  if (rows.length === 0) return []
  const items = await client
    .select({ collectionId: bookCollectionItems.collectionId, bookId: bookCollectionItems.bookId })
    .from(bookCollectionItems)
    .where(inArray(bookCollectionItems.collectionId, rows.map((row) => row.id)))
    .orderBy(asc(bookCollectionItems.collectionId), asc(bookCollectionItems.position))
  const bookIdsByCollection = new Map<string, string[]>()
  for (const item of items) {
    const bookIds = bookIdsByCollection.get(item.collectionId) ?? []
    bookIds.push(item.bookId)
    bookIdsByCollection.set(item.collectionId, bookIds)
  }
  return rows.map((row) => toRecord(row, bookIdsByCollection.get(row.id) ?? []))
}

async function booksByIdFor(client: DbLike, records: CollectionRecord[]): Promise<Map<string, BookWithCover>> {
  const found = await fetchBooksByIds(records.flatMap((record) => record.bookIds), client)
  return new Map(found.map((book) => [book.id, book]))
}

function coversOf(bookIds: readonly string[], booksById: ReadonlyMap<string, BookWithCover>, limit: number): CollectionCoverBook[] {
  return bookIds.slice(0, limit).flatMap((id) => {
    const book = booksById.get(id)
    return book ? [{ id: book.id, title: book.name, author: book.author, coverUrl: book.coverUrl }] : []
  })
}

function yearOf(date: string): string {
  return date.split('/').pop()?.trim() ?? ''
}

export async function loadCollectionById(id: string, client: DbLike = db): Promise<CollectionRecord | null> {
  const rows = await client.select().from(bookCollections).where(eq(bookCollections.id, id)).limit(1)
  return rows.length > 0 ? (await withBookIds(client, rows))[0] : null
}

export async function loadCollectionBySlugOrId(ref: string, client: DbLike = db): Promise<CollectionRecord | null> {
  const rows = await client.select().from(bookCollections).where(eq(bookCollections.slug, ref)).limit(1)
  if (rows.length > 0) return (await withBookIds(client, rows))[0]
  return loadCollectionById(ref, client)
}

export async function loadCollectionPageData(
  ref: string,
  viewer: CollectionViewer,
  client: DbLike = db,
): Promise<{ record: CollectionRecord; books: Array<{ book: BookWithCover; hiddenFromCatalog: boolean }> } | null> {
  const record = await loadCollectionBySlugOrId(ref, client)
  if (!record || !canViewCollection(record, viewer)) return null
  const canSeeHidden = canEditCollection(record, viewer)
  const items = (await fetchBooksByIds(record.bookIds, client))
    .map((book) => ({ book, hiddenFromCatalog: book.visibility !== 'published' }))
    .filter((item) => canSeeHidden || !item.hiddenFromCatalog)
  return { record, books: items }
}

export async function loadEditorBooks(bookIds: readonly string[], client: DbLike = db): Promise<EditorBook[]> {
  const found = await fetchBooksByIds(bookIds, client)
  const booksById = new Map(found.map((book) => [book.id, book]))
  return bookIds.flatMap((id) => {
    const book = booksById.get(id)
    if (!book) return []
    return [{
      id: book.id,
      title: book.name,
      author: book.author,
      coverUrl: book.coverUrl,
      year: yearOf(book.date),
      isArticle: book.type === 'Article',
      clubStatus: book.status ?? null,
      hiddenFromCatalog: book.visibility !== 'published',
    }]
  })
}

export async function listPublishedCollections(client: DbLike = db): Promise<CollectionListItem[]> {
  const rows = await client.select().from(bookCollections).where(eq(bookCollections.status, 'published'))
  const records = await withBookIds(client, rows)
  const booksById = await booksByIdFor(client, records)

  return records
    .map((record) => ({
      record,
      visible: record.bookIds.filter((id) => booksById.get(id)?.visibility === 'published'),
      sortAt: collectionSortAt(record) ?? record.createdAt,
    }))
    .filter(({ record, visible }) => record.slug !== null && visible.length > 0)
    .sort((a, b) => b.sortAt.getTime() - a.sortAt.getTime())
    .map(({ record, visible, sortAt }) => ({
      id: record.id,
      slug: record.slug as string,
      title: record.title,
      textsCount: visible.length,
      covers: coversOf(visible, booksById, CARD_COVERS),
      sortAt: sortAt.toISOString(),
    }))
}

export async function listMyCollections(userId: string, client: DbLike = db): Promise<MyCollectionItem[]> {
  const rows = await client.select().from(bookCollections).where(eq(bookCollections.authorUserId, userId))
  const records = await withBookIds(client, rows)
  const booksById = await booksByIdFor(client, records)

  return records
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .map((record) => ({
      id: record.id,
      slug: record.slug,
      title: record.title,
      status: record.status,
      moderationReason: record.moderationReason,
      textsCount: record.bookIds.length,
      covers: coversOf(record.bookIds, booksById, PROFILE_COVERS),
      changedAt: (record.editedAt ?? record.updatedAt).toISOString(),
      submittedAt: record.submittedAt ? record.submittedAt.toISOString() : null,
    }))
}

export async function listAdminQueue(client: DbLike = db): Promise<AdminCollectionQueue> {
  const rows = await client.select().from(bookCollections)
  const records = (await withBookIds(client, rows)).filter((record) => record.status !== 'draft')
  const booksById = await booksByIdFor(client, records)

  const item = (record: CollectionRecord, at: Date): AdminQueueItem => ({
    id: record.id,
    slug: record.slug,
    title: record.title,
    displayName: record.displayName,
    status: record.status,
    textsCount: record.bookIds.length,
    covers: coversOf(record.bookIds, booksById, QUEUE_COVERS),
    at: at.toISOString(),
    diffSummary: record.reviewedSnapshot && isChangedSinceReview(record)
      ? summarizeDiff(diffCollection(record.reviewedSnapshot, snapshotOf(record)))
      : null,
  })

  const submittedAt = (record: CollectionRecord) => record.submittedAt ?? record.createdAt
  const editedAt = (record: CollectionRecord) => record.editedAt ?? record.updatedAt
  const sortAt = (record: CollectionRecord) => collectionSortAt(record) ?? record.updatedAt
  const oldestFirst = (pick: (record: CollectionRecord) => Date) =>
    (a: CollectionRecord, b: CollectionRecord) => pick(a).getTime() - pick(b).getTime()
  const newestFirst = (pick: (record: CollectionRecord) => Date) =>
    (a: CollectionRecord, b: CollectionRecord) => pick(b).getTime() - pick(a).getTime()

  const pending = records.filter((record) => record.status === 'pending')
  const changed = records.filter((record) => isChangedSinceReview(record))
  const published = records.filter((record) => record.status === 'published' && !isChangedSinceReview(record))
  const rejectedOrHidden = records.filter((record) => record.status === 'rejected' || record.status === 'hidden')

  return {
    // Очередь проверки — от самых давно ждущих; списки — от свежих.
    pending: pending.sort(oldestFirst(submittedAt)).map((record) => item(record, submittedAt(record))),
    changed: changed.sort(oldestFirst(editedAt)).map((record) => item(record, editedAt(record))),
    published: published.sort(newestFirst(sortAt)).map((record) => item(record, sortAt(record))),
    rejectedOrHidden: rejectedOrHidden
      .sort(newestFirst((record) => record.updatedAt))
      .map((record) => item(record, record.updatedAt)),
  }
}

export async function searchPublishedBooks(query: string, client: DbLike = db): Promise<CollectionBookSearchResult[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const pattern = `%${q.replace(/[\\%_]/g, (char) => `\\${char}`)}%`
  const rows = await client
    .select()
    .from(books)
    .where(and(eq(books.visibility, 'published'), or(ilike(books.title, pattern), ilike(books.author, pattern))))
    .orderBy(asc(books.title))
    .limit(20)
  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    author: row.author,
    coverUrl: row.coverUrl,
    year: yearOf(row.publishedDate),
    isArticle: row.type === 'article',
    clubStatus: row.readingStatus === 'reading' || row.readingStatus === 'read' ? row.readingStatus : null,
  }))
}

async function requireCollection(client: DbLike, id: string): Promise<CollectionRecord> {
  const record = await loadCollectionById(id, client)
  if (!record) throw new CollectionError('not_found')
  return record
}

export async function createDraftCollection(
  tx: DbLike,
  input: { authorUserId: string; title: string; now: Date },
): Promise<CollectionRecord> {
  const issues = validateCollectionContent({ title: input.title, descriptionMarkdown: '', displayName: '', bookIds: [] }, 'save')
  if (issues.length > 0) throw new CollectionError('validation', { issues })
  const [row] = await tx
    .insert(bookCollections)
    .values({ authorUserId: input.authorUserId, title: input.title.trim(), createdAt: input.now, updatedAt: input.now })
    .returning()
  return toRecord(row, [])
}

export async function saveCollectionContent(
  tx: DbLike,
  input: { id: string; content: CollectionSnapshot; by: 'author' | 'admin'; now: Date },
): Promise<CollectionRecord> {
  const current = await requireCollection(tx, input.id)
  const issues = validateCollectionContent(input.content, 'save')
  if (issues.length > 0) throw new CollectionError('validation', { issues })

  const bookIds = normalizeBookIds(input.content.bookIds)
  // Уже стоящая книга может остаться, даже если админ скрыл её из каталога; новые — только опубликованные.
  const added = bookIds.filter((id) => !current.bookIds.includes(id))
  if (added.length > 0) {
    const published = await tx
      .select({ id: books.id })
      .from(books)
      .where(and(inArray(books.id, added), eq(books.visibility, 'published')))
    if (published.length !== added.length) {
      const publishedIds = new Set(published.map((row) => row.id))
      throw new CollectionError('book_not_published', { bookIds: added.filter((id) => !publishedIds.has(id)) })
    }
  }

  const { patch } = planContentSave(current, { ...input.content, bookIds }, input.by, input.now)
  await tx.update(bookCollections).set(patch).where(eq(bookCollections.id, input.id))
  if (bookIds.join('\n') !== current.bookIds.join('\n')) {
    await tx.delete(bookCollectionItems).where(eq(bookCollectionItems.collectionId, input.id))
    if (bookIds.length > 0) {
      await tx.insert(bookCollectionItems).values(
        bookIds.map((bookId, index) => ({ collectionId: input.id, bookId, position: index + 1 })),
      )
    }
  }
  return requireCollection(tx, input.id)
}

export async function submitCollection(tx: DbLike, input: { id: string; now: Date }): Promise<CollectionRecord> {
  const current = await requireCollection(tx, input.id)
  const published = current.bookIds.length > 0
    ? await tx
      .select({ id: books.id })
      .from(books)
      .where(and(inArray(books.id, current.bookIds), eq(books.visibility, 'published')))
    : []
  const patch = planSubmit(current, input.now, new Set(published.map((row) => row.id)))
  await tx.update(bookCollections).set(patch).where(eq(bookCollections.id, input.id))
  return requireCollection(tx, input.id)
}

async function allocateSlug(tx: DbLike, title: string): Promise<string> {
  const base = slugifyTitle(title, 'podborka')
  const rows = await tx
    .select({ slug: bookCollections.slug })
    .from(bookCollections)
    .where(like(bookCollections.slug, `${base}%`))
  const taken = new Set(rows.flatMap((row) => (row.slug ? [row.slug] : [])))
  return uniqueSlug(base, taken, RESERVED_SLUGS)
}

export async function applyAdminCollectionAction(
  tx: DbLike,
  input: { id: string; action: AdminCollectionAction; reason: string | null; now: Date },
): Promise<CollectionRecord> {
  const current = await requireCollection(tx, input.id)
  const needsSlug = (input.action === 'publish' || input.action === 'unhide') && !current.slug
  const slug = needsSlug ? await allocateSlug(tx, current.title) : null
  const patch = planAdminAction(current, input.action, { reason: input.reason, now: input.now, slug })
  await tx.update(bookCollections).set(patch).where(eq(bookCollections.id, input.id))
  return requireCollection(tx, input.id)
}

export async function deleteCollection(tx: DbLike, id: string): Promise<void> {
  await tx.delete(bookCollections).where(eq(bookCollections.id, id))
}
