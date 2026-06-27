import { and, desc, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookSummaries, bookSummaryRevisions, books, signupBooks, users } from '@/lib/db/schema'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import { BookValidationError, normalizeBookSlug } from '@/lib/books'

export const SUMMARY_STATUSES = ['draft', 'pending', 'published', 'rejected'] as const
export type SummaryStatus = (typeof SUMMARY_STATUSES)[number]
export const SUMMARY_REVISION_STATUSES = ['draft', 'pending', 'rejected'] as const
export type SummaryRevisionStatus = (typeof SUMMARY_REVISION_STATUSES)[number]

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
  bookSlug?: string | null
  authorName?: string | null
  authorEmail?: string | null
}

export interface SummaryPatch {
  displayName?: string
  title?: string
  tldr?: string
  bodyMarkdown?: string
}

export interface BookSummaryRevision {
  id: string
  summaryId: string
  displayName: string
  title: string
  tldr: string
  bodyMarkdown: string
  status: SummaryRevisionStatus
  rejectionReason: string | null
  submittedAt: Date | null
  createdAt: Date
  updatedAt: Date
  bookId?: string | null
  authorUserId?: string | null
  bookTitle?: string | null
  bookAuthor?: string | null
  bookSlug?: string | null
  authorName?: string | null
  authorEmail?: string | null
  publishedDisplayName?: string | null
  publishedTitle?: string | null
  publishedTldr?: string | null
  publishedBodyMarkdown?: string | null
  publishedAt?: Date | null
}

type SummaryRow = typeof bookSummaries.$inferSelect & {
  bookTitle?: string | null
  bookAuthor?: string | null
  bookSlug?: string | null
  authorName?: string | null
  authorEmail?: string | null
}

type SummaryRevisionRow = typeof bookSummaryRevisions.$inferSelect & {
  bookId?: string | null
  authorUserId?: string | null
  bookTitle?: string | null
  bookAuthor?: string | null
  bookSlug?: string | null
  authorName?: string | null
  authorEmail?: string | null
  publishedDisplayName?: string | null
  publishedTitle?: string | null
  publishedTldr?: string | null
  publishedBodyMarkdown?: string | null
  publishedAt?: Date | null
}

type DbClient = typeof db

function asStatus(value: string): SummaryStatus {
  return SUMMARY_STATUSES.includes(value as SummaryStatus) ? (value as SummaryStatus) : 'draft'
}

function asRevisionStatus(value: string): SummaryRevisionStatus {
  return SUMMARY_REVISION_STATUSES.includes(value as SummaryRevisionStatus)
    ? (value as SummaryRevisionStatus)
    : 'draft'
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
    bookSlug: row.bookSlug ?? null,
    authorName: row.authorName ?? null,
    authorEmail: row.authorEmail ?? null,
  }
}

function rowToSummaryRevision(row: SummaryRevisionRow): BookSummaryRevision {
  return {
    id: row.id,
    summaryId: row.summaryId,
    displayName: row.displayName,
    title: row.title,
    tldr: row.tldr,
    bodyMarkdown: row.bodyMarkdown,
    status: asRevisionStatus(row.status),
    rejectionReason: row.rejectionReason,
    submittedAt: row.submittedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    bookId: row.bookId ?? null,
    authorUserId: row.authorUserId ?? null,
    bookTitle: row.bookTitle ?? null,
    bookAuthor: row.bookAuthor ?? null,
    bookSlug: row.bookSlug ?? null,
    authorName: row.authorName ?? null,
    authorEmail: row.authorEmail ?? null,
    publishedDisplayName: row.publishedDisplayName ?? null,
    publishedTitle: row.publishedTitle ?? null,
    publishedTldr: row.publishedTldr ?? null,
    publishedBodyMarkdown: row.publishedBodyMarkdown ?? null,
    publishedAt: row.publishedAt ?? null,
  }
}

function normalizeText(value: unknown): string | undefined {
  return typeof value === 'string' ? value.trim() : undefined
}

function normalizeAdminBookSlug(value: unknown): string {
  try {
    return normalizeBookSlug(value)
  } catch (error) {
    if (error instanceof BookValidationError) throw new SummaryValidationError(error.message)
    throw error
  }
}

function ensureBookSlug(slug: string | null | undefined): asserts slug is string {
  if (!slug?.trim()) throw new SummaryValidationError('book slug is required')
}

function rethrowSlugConstraint(error: unknown): never {
  if (typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') {
    throw new SummaryValidationError('book slug already exists')
  }
  throw error
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

function ensureCompleteForSubmit(summary: Pick<BookSummary, 'displayName' | 'title' | 'tldr' | 'bodyMarkdown'>) {
  if (!summary.displayName.trim()) throw new SummaryValidationError('displayName is required')
  if (!summary.title.trim()) throw new SummaryValidationError('title is required')
  if (!summary.tldr.trim()) throw new SummaryValidationError('tldr is required')
  if (!summary.bodyMarkdown.trim()) throw new SummaryValidationError('bodyMarkdown is required')
}

function ensureRevisionAuthor(revision: BookSummaryRevision, userId: string) {
  if (revision.authorUserId !== userId) {
    throw new SummaryValidationError('summary not found')
  }
}

function ensureRevisionEditable(revision: BookSummaryRevision) {
  if (revision.status !== 'draft' && revision.status !== 'rejected') {
    throw new SummaryValidationError('summary revision is not editable by author')
  }
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

async function selectRevisionBySummaryId(summaryId: string, dbClient: DbClient = db): Promise<BookSummaryRevision | null> {
  const [row] = await dbClient
    .select()
    .from(bookSummaryRevisions)
    .where(eq(bookSummaryRevisions.summaryId, summaryId))
    .limit(1)
  return row ? rowToSummaryRevision(row as SummaryRevisionRow) : null
}

async function selectRevisionById(id: string, dbClient: DbClient = db): Promise<BookSummaryRevision | null> {
  const [row] = await dbClient
    .select({
      id: bookSummaryRevisions.id,
      summaryId: bookSummaryRevisions.summaryId,
      displayName: bookSummaryRevisions.displayName,
      title: bookSummaryRevisions.title,
      tldr: bookSummaryRevisions.tldr,
      bodyMarkdown: bookSummaryRevisions.bodyMarkdown,
      status: bookSummaryRevisions.status,
      rejectionReason: bookSummaryRevisions.rejectionReason,
      submittedAt: bookSummaryRevisions.submittedAt,
      createdAt: bookSummaryRevisions.createdAt,
      updatedAt: bookSummaryRevisions.updatedAt,
      bookId: bookSummaries.bookId,
      authorUserId: bookSummaries.authorUserId,
      bookSlug: books.slug,
      publishedDisplayName: bookSummaries.displayName,
      publishedTitle: bookSummaries.title,
      publishedTldr: bookSummaries.tldr,
      publishedBodyMarkdown: bookSummaries.bodyMarkdown,
      publishedAt: bookSummaries.publishedAt,
    })
    .from(bookSummaryRevisions)
    .innerJoin(bookSummaries, eq(bookSummaryRevisions.summaryId, bookSummaries.id))
    .innerJoin(books, eq(bookSummaries.bookId, books.id))
    .where(eq(bookSummaryRevisions.id, id))
    .limit(1)
  return row ? rowToSummaryRevision(row as SummaryRevisionRow) : null
}

async function selectAdminBookForSummary(id: string, dbClient: DbClient = db): Promise<{ bookId: string; bookSlug: string | null } | null> {
  const [row] = await dbClient
    .select({ bookId: bookSummaries.bookId, bookSlug: books.slug })
    .from(bookSummaries)
    .innerJoin(books, eq(bookSummaries.bookId, books.id))
    .where(eq(bookSummaries.id, id))
    .limit(1)
  return row ?? null
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

export async function getActiveSummaryRevision(summaryId: string): Promise<BookSummaryRevision | null> {
  return selectRevisionBySummaryId(summaryId)
}

export async function openOrCreateSummaryRevision({
  summaryId,
  userId,
  actorLabel,
}: {
  summaryId: string
  userId: string
  actorLabel?: string | null
}): Promise<BookSummaryRevision> {
  const summary = await selectSummaryById(summaryId)
  if (!summary) throw new SummaryValidationError('summary not found')
  ensureAuthor(summary, userId)
  if (summary.status !== 'published') {
    throw new SummaryValidationError('published summary is required')
  }

  const existing = await selectRevisionBySummaryId(summaryId)
  if (existing) return existing

  if (!(await hasReadSignup(userId, summary.bookId))) {
    throw new SummaryValidationError('book must be marked as read')
  }

  try {
    const [created] = await withAuditContext(
      { actorUserId: userId, actorLabel: auditLabel(actorLabel), source: 'summary' },
      async (tx) => tx.insert(bookSummaryRevisions).values({
        summaryId,
        displayName: summary.displayName,
        title: summary.title,
        tldr: summary.tldr,
        bodyMarkdown: summary.bodyMarkdown,
        status: 'draft',
        updatedAt: new Date(),
      }).returning(),
    )
    return rowToSummaryRevision(created as SummaryRevisionRow)
  } catch (error) {
    const concurrent = await selectRevisionBySummaryId(summaryId)
    if (concurrent) return concurrent
    throw error
  }
}

export async function saveAuthorSummaryRevision({
  id,
  userId,
  actorLabel,
  patch,
}: {
  id: string
  userId: string
  actorLabel?: string | null
  patch: Record<string, unknown>
}): Promise<BookSummaryRevision> {
  const current = await selectRevisionById(id)
  if (!current) throw new SummaryValidationError('summary not found')
  ensureRevisionAuthor(current, userId)
  ensureRevisionEditable(current)

  const normalized = normalizeSummaryPatch(patch)
  const [updated] = await withAuditContext(
    { actorUserId: userId, actorLabel: auditLabel(actorLabel), source: 'summary' },
    async (tx) => tx.update(bookSummaryRevisions)
      .set({ ...normalized, updatedAt: new Date() })
      .where(eq(bookSummaryRevisions.id, id))
      .returning(),
  )
  return rowToSummaryRevision({
    ...(updated as SummaryRevisionRow),
    bookId: current.bookId,
    authorUserId: current.authorUserId,
  })
}

export async function submitAuthorSummaryRevision({
  id,
  userId,
  actorLabel,
}: {
  id: string
  userId: string
  actorLabel?: string | null
}): Promise<BookSummaryRevision> {
  const current = await selectRevisionById(id)
  if (!current) throw new SummaryValidationError('summary not found')
  ensureRevisionAuthor(current, userId)
  ensureRevisionEditable(current)
  ensureCompleteForSubmit(current)
  if (!current.bookId || !(await hasReadSignup(userId, current.bookId))) {
    throw new SummaryValidationError('book must be marked as read')
  }

  const now = new Date()
  const [updated] = await withAuditContext(
    { actorUserId: userId, actorLabel: auditLabel(actorLabel), source: 'summary' },
    async (tx) => tx.update(bookSummaryRevisions)
      .set({
        status: 'pending',
        rejectionReason: null,
        submittedAt: now,
        updatedAt: now,
      })
      .where(eq(bookSummaryRevisions.id, id))
      .returning(),
  )
  return rowToSummaryRevision({
    ...(updated as SummaryRevisionRow),
    bookId: current.bookId,
    authorUserId: current.authorUserId,
  })
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
      bookSlug: books.slug,
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
      bookSlug: books.slug,
      authorName: users.name,
      authorEmail: users.contactEmail,
    })
    .from(bookSummaries)
    .innerJoin(books, eq(bookSummaries.bookId, books.id))
    .leftJoin(users, eq(bookSummaries.authorUserId, users.id))
    .orderBy(desc(bookSummaries.updatedAt))
  return rows.map(row => rowToSummary(row as SummaryRow))
}

export async function listAdminSummaryRevisions(): Promise<BookSummaryRevision[]> {
  const rows = await db
    .select({
      id: bookSummaryRevisions.id,
      summaryId: bookSummaryRevisions.summaryId,
      displayName: bookSummaryRevisions.displayName,
      title: bookSummaryRevisions.title,
      tldr: bookSummaryRevisions.tldr,
      bodyMarkdown: bookSummaryRevisions.bodyMarkdown,
      status: bookSummaryRevisions.status,
      rejectionReason: bookSummaryRevisions.rejectionReason,
      submittedAt: bookSummaryRevisions.submittedAt,
      createdAt: bookSummaryRevisions.createdAt,
      updatedAt: bookSummaryRevisions.updatedAt,
      bookId: bookSummaries.bookId,
      authorUserId: bookSummaries.authorUserId,
      bookTitle: books.title,
      bookAuthor: books.author,
      bookSlug: books.slug,
      authorName: users.name,
      authorEmail: users.contactEmail,
      publishedDisplayName: bookSummaries.displayName,
      publishedTitle: bookSummaries.title,
      publishedTldr: bookSummaries.tldr,
      publishedBodyMarkdown: bookSummaries.bodyMarkdown,
      publishedAt: bookSummaries.publishedAt,
    })
    .from(bookSummaryRevisions)
    .innerJoin(bookSummaries, eq(bookSummaryRevisions.summaryId, bookSummaries.id))
    .innerJoin(books, eq(bookSummaries.bookId, books.id))
    .leftJoin(users, eq(bookSummaries.authorUserId, users.id))
    .orderBy(desc(bookSummaryRevisions.updatedAt))
  return rows.map(row => rowToSummaryRevision(row as SummaryRevisionRow))
}

export async function adminUpdateSummaryRevision({
  id,
  adminUserId,
  actorLabel,
  patch,
}: {
  id: string
  adminUserId: string
  actorLabel?: string | null
  patch: Record<string, unknown> & { rejectionReason?: unknown }
}): Promise<BookSummaryRevision> {
  const current = await selectRevisionById(id)
  if (!current || !current.bookId) throw new SummaryValidationError('summary revision not found')
  const normalized = normalizeSummaryPatch(patch)
  const rejectionReason = normalizeText(patch.rejectionReason)
  const bookSlug = patch.bookSlug === undefined ? undefined : normalizeAdminBookSlug(patch.bookSlug)
  ensureBookSlug(bookSlug ?? current.bookSlug)
  const update: Partial<typeof bookSummaryRevisions.$inferInsert> = { ...normalized, updatedAt: new Date() }
  if (rejectionReason !== undefined) update.rejectionReason = rejectionReason || null

  let updated: typeof bookSummaryRevisions.$inferSelect | undefined
  try {
    ;[updated] = await withAuditContext(
      { actorUserId: adminUserId, actorLabel: auditLabel(actorLabel), source: 'admin' },
      async (tx) => {
        const rows = await tx.update(bookSummaryRevisions)
          .set(update)
          .where(eq(bookSummaryRevisions.id, id))
          .returning()
        if (bookSlug !== undefined) {
          await tx.update(books).set({ slug: bookSlug, updatedAt: new Date() }).where(eq(books.id, current.bookId!))
        }
        return rows
      },
    )
  } catch (error) {
    rethrowSlugConstraint(error)
  }
  if (!updated) throw new SummaryValidationError('summary revision not found')
  return rowToSummaryRevision({
    ...(updated as SummaryRevisionRow),
    bookId: current.bookId,
    bookSlug: bookSlug ?? current.bookSlug,
  })
}

export async function adminPublishSummaryRevision({
  id,
  adminUserId,
  actorLabel,
}: {
  id: string
  adminUserId: string
  actorLabel?: string | null
}): Promise<BookSummary> {
  const revision = await selectRevisionById(id)
  if (!revision) throw new SummaryValidationError('summary revision not found')
  if (revision.status !== 'pending') {
    throw new SummaryValidationError('summary revision is not pending')
  }
  ensureCompleteForSubmit(revision)
  ensureBookSlug(revision.bookSlug)

  const now = new Date()
  return withAuditContext(
    { actorUserId: adminUserId, actorLabel: auditLabel(actorLabel), source: 'admin' },
    async (tx) => {
      const [updated] = await tx.update(bookSummaries)
        .set({
          displayName: revision.displayName,
          title: revision.title,
          tldr: revision.tldr,
          bodyMarkdown: revision.bodyMarkdown,
          updatedAt: now,
        })
        .where(eq(bookSummaries.id, revision.summaryId))
        .returning()
      if (!updated) throw new SummaryValidationError('summary not found')

      await tx.delete(bookSummaryRevisions)
        .where(eq(bookSummaryRevisions.id, id))
        .returning()

      return rowToSummary({ ...(updated as SummaryRow), bookSlug: revision.bookSlug })
    },
  )
}

export async function adminRejectSummaryRevision({
  id,
  adminUserId,
  actorLabel,
  rejectionReason,
}: {
  id: string
  adminUserId: string
  actorLabel?: string | null
  rejectionReason: string
}): Promise<BookSummaryRevision> {
  const reason = rejectionReason.trim()
  if (!reason) throw new SummaryValidationError('rejection reason is required')

  const current = await selectRevisionById(id)
  if (!current) throw new SummaryValidationError('summary revision not found')
  if (current.status !== 'pending') {
    throw new SummaryValidationError('summary revision is not pending')
  }
  ensureBookSlug(current.bookSlug)

  const [updated] = await withAuditContext(
    { actorUserId: adminUserId, actorLabel: auditLabel(actorLabel), source: 'admin', reason },
    async (tx) => tx.update(bookSummaryRevisions)
      .set({
        status: 'rejected',
        rejectionReason: reason,
        updatedAt: new Date(),
      })
      .where(eq(bookSummaryRevisions.id, id))
      .returning(),
  )
  return rowToSummaryRevision({
    ...(updated as SummaryRevisionRow),
    summaryId: current.summaryId,
    bookId: current.bookId,
    bookSlug: current.bookSlug,
    authorUserId: current.authorUserId,
  })
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
  const current = await selectAdminBookForSummary(id)
  if (!current) throw new SummaryValidationError('summary not found')
  const normalized = normalizeSummaryPatch(patch)
  const rejectionReason = normalizeText(patch.rejectionReason)
  const bookSlug = patch.bookSlug === undefined ? undefined : normalizeAdminBookSlug(patch.bookSlug)
  ensureBookSlug(bookSlug ?? current.bookSlug)
  const update: Partial<typeof bookSummaries.$inferInsert> = { ...normalized, updatedAt: new Date() }
  if (rejectionReason !== undefined) update.rejectionReason = rejectionReason || null

  let updated: typeof bookSummaries.$inferSelect | undefined
  try {
    ;[updated] = await withAuditContext(
      { actorUserId: adminUserId, actorLabel: auditLabel(actorLabel), source: 'admin' },
      async (tx) => {
        const rows = await tx.update(bookSummaries).set(update).where(eq(bookSummaries.id, id)).returning()
        if (bookSlug !== undefined) {
          await tx.update(books).set({ slug: bookSlug, updatedAt: new Date() }).where(eq(books.id, current.bookId))
        }
        return rows
      },
    )
  } catch (error) {
    rethrowSlugConstraint(error)
  }
  if (!updated) throw new SummaryValidationError('summary not found')
  return rowToSummary({
    ...(updated as SummaryRow),
    bookSlug: bookSlug ?? current.bookSlug,
  })
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
  const current = await selectAdminBookForSummary(id)
  if (!current) throw new SummaryValidationError('summary not found')
  ensureBookSlug(current.bookSlug)
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
  return rowToSummary({ ...(updated as SummaryRow), bookSlug: current.bookSlug })
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

  const current = await selectAdminBookForSummary(id)
  if (!current) throw new SummaryValidationError('summary not found')
  ensureBookSlug(current.bookSlug)

  const [updated] = await withAuditContext(
    { actorUserId: adminUserId, actorLabel: auditLabel(actorLabel), source: 'admin', reason },
    async (tx) => tx.update(bookSummaries).set({
      status: 'rejected',
      rejectionReason: reason,
      updatedAt: new Date(),
    }).where(eq(bookSummaries.id, id)).returning(),
  )
  if (!updated) throw new SummaryValidationError('summary not found')
  return rowToSummary({ ...(updated as SummaryRow), bookSlug: current.bookSlug })
}
