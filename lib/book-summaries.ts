import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookSummaries, books, signupBooks, users } from '@/lib/db/schema'
import { withAuditContext } from '@/lib/audit/with-audit-context'

export const SUMMARY_STATUSES = ['draft', 'pending', 'published', 'rejected'] as const
export type SummaryStatus = (typeof SUMMARY_STATUSES)[number]

export class SummaryValidationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SummaryValidationError'
  }
}

export interface BookSummary {
  id: string
  bookId: string
  authorUserId: string
  displayName: string
  title: string
  tldr: string
  bodyMarkdown: string
  status: SummaryStatus
  rejectionReason: string | null
  submittedAt: Date | null
  publishedAt: Date | null
  createdAt: Date
  updatedAt: Date
  bookTitle?: string | null
  bookAuthor?: string | null
  authorName?: string | null
  authorEmail?: string | null
}

export interface SummaryPatch {
  displayName?: string
  title?: string
  tldr?: string
  bodyMarkdown?: string
}

type SummaryRow = typeof bookSummaries.$inferSelect & {
  bookTitle?: string | null
  bookAuthor?: string | null
  authorName?: string | null
  authorEmail?: string | null
}

type DbClient = typeof db

function asStatus(value: string): SummaryStatus {
  return SUMMARY_STATUSES.includes(value as SummaryStatus) ? (value as SummaryStatus) : 'draft'
}

function rowToSummary(row: SummaryRow): BookSummary {
  return {
    id: row.id,
    bookId: row.bookId,
    authorUserId: row.authorUserId,
    displayName: row.displayName,
    title: row.title,
    tldr: row.tldr,
    bodyMarkdown: row.bodyMarkdown,
    status: asStatus(row.status),
    rejectionReason: row.rejectionReason,
    submittedAt: row.submittedAt,
    publishedAt: row.publishedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    bookTitle: row.bookTitle ?? null,
    bookAuthor: row.bookAuthor ?? null,
    authorName: row.authorName ?? null,
    authorEmail: row.authorEmail ?? null,
  }
}

function normalizeText(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() : undefined
}

export function normalizeSummaryPatch(input: Record<string, unknown>): SummaryPatch {
  const patch: SummaryPatch = {}
  const displayName = normalizeText(input.displayName)
  const title = normalizeText(input.title)
  const tldr = normalizeText(input.tldr)
  const bodyMarkdown = normalizeText(input.bodyMarkdown)
  if (displayName !== undefined) patch.displayName = displayName
  if (title !== undefined) patch.title = title
  if (tldr !== undefined) patch.tldr = tldr
  if (bodyMarkdown !== undefined) patch.bodyMarkdown = bodyMarkdown
  return patch
}

function ensureAuthor(summary: BookSummary, userId: string) {
  if (summary.authorUserId !== userId) {
    throw new SummaryValidationError('summary not found')
  }
}

function ensureAuthorEditable(summary: BookSummary) {
  if (summary.status !== 'draft' && summary.status !== 'rejected') {
    throw new SummaryValidationError('summary is not editable by author')
  }
}

function ensureCompleteForSubmit(summary: BookSummary) {
  if (!summary.displayName.trim()) throw new SummaryValidationError('displayName is required')
  if (!summary.title.trim()) throw new SummaryValidationError('title is required')
  if (!summary.tldr.trim()) throw new SummaryValidationError('tldr is required')
  if (!summary.bodyMarkdown.trim()) throw new SummaryValidationError('bodyMarkdown is required')
}

async function selectSummaryByBookAndUser(bookId: string, userId: string, dbClient: DbClient = db): Promise<BookSummary | null> {
  const [row] = await dbClient
    .select()
    .from(bookSummaries)
    .where(and(eq(bookSummaries.bookId, bookId), eq(bookSummaries.authorUserId, userId)))
    .limit(1)
  return row ? rowToSummary(row as SummaryRow) : null
}

async function selectSummaryById(id: string, dbClient: DbClient = db): Promise<BookSummary | null> {
  const [row] = await dbClient
    .select()
    .from(bookSummaries)
    .where(eq(bookSummaries.id, id))
    .limit(1)
  return row ? rowToSummary(row as SummaryRow) : null
}

async function hasReadSignup(userId: string, bookId: string, dbClient: DbClient = db): Promise<boolean> {
  const rows = await dbClient
    .select({ bookId: signupBooks.bookId })
    .from(signupBooks)
    .where(and(
      eq(signupBooks.userId, userId),
      eq(signupBooks.bookId, bookId),
      eq(signupBooks.personalStatus, 'read'),
    ))
    .limit(1)
  return rows.length > 0
}

function auditLabel(actorLabel: string | null | undefined): string | null {
  const label = actorLabel?.trim()
  return label || null
}

export async function openOrCreateSummaryDraft({
  bookId,
  userId,
  actorLabel,
  defaultDisplayName,
}: {
  bookId: string
  userId: string
  actorLabel?: string | null
  defaultDisplayName?: string | null
}): Promise<BookSummary> {
  const existing = await selectSummaryByBookAndUser(bookId, userId)
  if (existing) return existing

  if (!(await hasReadSignup(userId, bookId))) {
    throw new SummaryValidationError('book must be marked as read')
  }

  const displayName = defaultDisplayName?.trim() || actorLabel?.trim() || 'Участник клуба'
  const [created] = await withAuditContext(
    { actorUserId: userId, actorLabel: auditLabel(actorLabel), source: 'summary' },
    async (tx) => tx.insert(bookSummaries).values({
      bookId,
      authorUserId: userId,
      displayName,
      status: 'draft',
      updatedAt: new Date(),
    }).returning(),
  )
  return rowToSummary(created as SummaryRow)
}

export async function getAuthorSummaryForBook(bookId: string, userId: string): Promise<BookSummary | null> {
  return selectSummaryByBookAndUser(bookId, userId)
}

export async function getAuthorSummaryById(id: string, userId: string): Promise<BookSummary | null> {
  const summary = await selectSummaryById(id)
  if (!summary || summary.authorUserId !== userId) return null
  return summary
}

export async function saveAuthorSummary({
  id,
  userId,
  actorLabel,
  patch,
}: {
  id: string
  userId: string
  actorLabel?: string | null
  patch: Record<string, unknown>
}): Promise<BookSummary> {
  const current = await selectSummaryById(id)
  if (!current) throw new SummaryValidationError('summary not found')
  ensureAuthor(current, userId)
  ensureAuthorEditable(current)

  const normalized = normalizeSummaryPatch(patch)
  const [updated] = await withAuditContext(
    { actorUserId: userId, actorLabel: auditLabel(actorLabel), source: 'summary' },
    async (tx) => tx.update(bookSummaries).set({ ...normalized, updatedAt: new Date() }).where(eq(bookSummaries.id, id)).returning(),
  )
  return rowToSummary(updated as SummaryRow)
}

export async function submitAuthorSummary({
  id,
  userId,
  actorLabel,
}: {
  id: string
  userId: string
  actorLabel?: string | null
}): Promise<BookSummary> {
  const current = await selectSummaryById(id)
  if (!current) throw new SummaryValidationError('summary not found')
  ensureAuthor(current, userId)
  ensureAuthorEditable(current)
  ensureCompleteForSubmit(current)
  if (!(await hasReadSignup(userId, current.bookId))) {
    throw new SummaryValidationError('book must be marked as read')
  }

  const now = new Date()
  const [updated] = await withAuditContext(
    { actorUserId: userId, actorLabel: auditLabel(actorLabel), source: 'summary' },
    async (tx) => tx.update(bookSummaries).set({
      status: 'pending',
      rejectionReason: null,
      submittedAt: now,
      updatedAt: now,
    }).where(eq(bookSummaries.id, id)).returning(),
  )
  return rowToSummary(updated as SummaryRow)
}

export async function getPublishedSummariesForBook(bookId: string): Promise<BookSummary[]> {
  const rows = await db
    .select({
      id: bookSummaries.id,
      bookId: bookSummaries.bookId,
      authorUserId: bookSummaries.authorUserId,
      displayName: bookSummaries.displayName,
      title: bookSummaries.title,
      tldr: bookSummaries.tldr,
      bodyMarkdown: bookSummaries.bodyMarkdown,
      status: bookSummaries.status,
      rejectionReason: bookSummaries.rejectionReason,
      submittedAt: bookSummaries.submittedAt,
      publishedAt: bookSummaries.publishedAt,
      createdAt: bookSummaries.createdAt,
      updatedAt: bookSummaries.updatedAt,
      bookTitle: books.title,
      bookAuthor: books.author,
    })
    .from(bookSummaries)
    .innerJoin(books, eq(bookSummaries.bookId, books.id))
    .where(and(eq(bookSummaries.bookId, bookId), eq(bookSummaries.status, 'published')))
    .orderBy(desc(bookSummaries.publishedAt), desc(bookSummaries.updatedAt))
  return rows.map(row => rowToSummary(row as SummaryRow))
}

export async function getPublishedSummaryCounts(): Promise<Map<string, number>> {
  const rows = await db
    .select({ bookId: bookSummaries.bookId, count: sql<number>`count(*)::int` })
    .from(bookSummaries)
    .where(eq(bookSummaries.status, 'published'))
    .groupBy(bookSummaries.bookId)
  return new Map(rows.map(row => [row.bookId, Number(row.count)]))
}

export async function listAdminSummaries(): Promise<BookSummary[]> {
  const rows = await db
    .select({
      id: bookSummaries.id,
      bookId: bookSummaries.bookId,
      authorUserId: bookSummaries.authorUserId,
      displayName: bookSummaries.displayName,
      title: bookSummaries.title,
      tldr: bookSummaries.tldr,
      bodyMarkdown: bookSummaries.bodyMarkdown,
      status: bookSummaries.status,
      rejectionReason: bookSummaries.rejectionReason,
      submittedAt: bookSummaries.submittedAt,
      publishedAt: bookSummaries.publishedAt,
      createdAt: bookSummaries.createdAt,
      updatedAt: bookSummaries.updatedAt,
      bookTitle: books.title,
      bookAuthor: books.author,
      authorName: users.name,
      authorEmail: users.contactEmail,
    })
    .from(bookSummaries)
    .innerJoin(books, eq(bookSummaries.bookId, books.id))
    .leftJoin(users, eq(bookSummaries.authorUserId, users.id))
    .orderBy(desc(bookSummaries.updatedAt))
  return rows.map(row => rowToSummary(row as SummaryRow))
}

export async function adminUpdateSummary({
  id,
  adminUserId,
  actorLabel,
  patch,
}: {
  id: string
  adminUserId: string
  actorLabel?: string | null
  patch: Record<string, unknown> & { rejectionReason?: unknown }
}): Promise<BookSummary> {
  const normalized = normalizeSummaryPatch(patch)
  const rejectionReason = normalizeText(patch.rejectionReason)
  const update: Partial<typeof bookSummaries.$inferInsert> = { ...normalized, updatedAt: new Date() }
  if (rejectionReason !== undefined) update.rejectionReason = rejectionReason || null

  const [updated] = await withAuditContext(
    { actorUserId: adminUserId, actorLabel: auditLabel(actorLabel), source: 'admin' },
    async (tx) => tx.update(bookSummaries).set(update).where(eq(bookSummaries.id, id)).returning(),
  )
  if (!updated) throw new SummaryValidationError('summary not found')
  return rowToSummary(updated as SummaryRow)
}

export async function adminPublishSummary({
  id,
  adminUserId,
  actorLabel,
}: {
  id: string
  adminUserId: string
  actorLabel?: string | null
}): Promise<BookSummary> {
  const now = new Date()
  const [updated] = await withAuditContext(
    { actorUserId: adminUserId, actorLabel: auditLabel(actorLabel), source: 'admin' },
    async (tx) => tx.update(bookSummaries).set({
      status: 'published',
      rejectionReason: null,
      publishedAt: now,
      updatedAt: now,
    }).where(eq(bookSummaries.id, id)).returning(),
  )
  if (!updated) throw new SummaryValidationError('summary not found')
  return rowToSummary(updated as SummaryRow)
}

export async function adminRejectSummary({
  id,
  adminUserId,
  actorLabel,
  rejectionReason,
}: {
  id: string
  adminUserId: string
  actorLabel?: string | null
  rejectionReason: string
}): Promise<BookSummary> {
  const reason = rejectionReason.trim()
  if (!reason) throw new SummaryValidationError('rejection reason is required')

  const [updated] = await withAuditContext(
    { actorUserId: adminUserId, actorLabel: auditLabel(actorLabel), source: 'admin', reason },
    async (tx) => tx.update(bookSummaries).set({
      status: 'rejected',
      rejectionReason: reason,
      updatedAt: new Date(),
    }).where(eq(bookSummaries.id, id)).returning(),
  )
  if (!updated) throw new SummaryValidationError('summary not found')
  return rowToSummary(updated as SummaryRow)
}
