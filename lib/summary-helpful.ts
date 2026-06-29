import { createHash, randomUUID } from 'node:crypto'
import { and, eq, sql } from 'drizzle-orm'
import { db } from '@/lib/db'
import { bookSummaries, bookSummaryHelpfulReactions } from '@/lib/db/schema'
import { withAuditContext } from '@/lib/audit/with-audit-context'

export const SUMMARY_HELPFUL_COOKIE = '__Secure-summary-helpful'
export const SUMMARY_HELPFUL_COOKIE_PATH = '/api/summaries'
export const SUMMARY_HELPFUL_MAX_AGE = 31_536_000

export type HelpfulActor =
  | { kind: 'user'; userId: string; visitorHash?: string }
  | { kind: 'visitor'; visitorHash: string }
  | { kind: 'new-visitor'; visitorId: string; visitorHash: string }

export interface HelpfulState {
  count: number
  reacted: boolean
}

export class SummaryHelpfulNotFoundError extends Error {
  constructor() {
    super('summary not found')
    this.name = 'SummaryHelpfulNotFoundError'
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

export function hashHelpfulVisitorId(visitorId: string): string {
  return createHash('sha256').update(visitorId).digest('hex')
}

export function hashHelpfulVisitorCookie(value: string | undefined): string | null {
  return value && UUID_PATTERN.test(value) ? hashHelpfulVisitorId(value) : null
}

export function createHelpfulVisitorActor(): Extract<HelpfulActor, { kind: 'new-visitor' }> {
  const visitorId = randomUUID()
  return { kind: 'new-visitor', visitorId, visitorHash: hashHelpfulVisitorId(visitorId) }
}

type DbClient = typeof db

async function assertPublishedSummary(summaryId: string, client: DbClient): Promise<void> {
  const [summary] = await client
    .select({ id: bookSummaries.id })
    .from(bookSummaries)
    .where(and(eq(bookSummaries.id, summaryId), eq(bookSummaries.status, 'published')))
    .limit(1)
  if (!summary) throw new SummaryHelpfulNotFoundError()
}

function storedActor(actor: HelpfulActor): { userId: string | null; visitorHash: string | null } {
  if (actor.kind === 'user') return { userId: actor.userId, visitorHash: null }
  return { userId: null, visitorHash: actor.visitorHash }
}

function actorWhere(summaryId: string, actor: HelpfulActor) {
  return and(
    eq(bookSummaryHelpfulReactions.summaryId, summaryId),
    actor.kind === 'user'
      ? eq(bookSummaryHelpfulReactions.userId, actor.userId)
      : eq(bookSummaryHelpfulReactions.visitorHash, actor.visitorHash),
  )
}

async function readHelpfulState(
  summaryId: string,
  actor: HelpfulActor | null,
  client: DbClient,
): Promise<HelpfulState> {
  const [aggregate] = await client
    .select({ count: sql<number>`count(*)::int` })
    .from(bookSummaryHelpfulReactions)
    .where(eq(bookSummaryHelpfulReactions.summaryId, summaryId))
  if (!actor) return { count: aggregate?.count ?? 0, reacted: false }

  const [reaction] = await client
    .select({ id: bookSummaryHelpfulReactions.id })
    .from(bookSummaryHelpfulReactions)
    .where(actorWhere(summaryId, actor))
    .limit(1)
  return { count: aggregate?.count ?? 0, reacted: Boolean(reaction) }
}

async function mergeVisitorReactions(visitorHash: string, userId: string, client: DbClient): Promise<void> {
  const guestReactions = await client
    .select({ summaryId: bookSummaryHelpfulReactions.summaryId })
    .from(bookSummaryHelpfulReactions)
    .where(eq(bookSummaryHelpfulReactions.visitorHash, visitorHash))

  for (const reaction of guestReactions) {
    await client
      .insert(bookSummaryHelpfulReactions)
      .values({ summaryId: reaction.summaryId, userId, visitorHash: null })
      .onConflictDoNothing()
  }

  if (guestReactions.length > 0) {
    await client
      .delete(bookSummaryHelpfulReactions)
      .where(eq(bookSummaryHelpfulReactions.visitorHash, visitorHash))
  }
}

export async function getSummaryHelpfulState(
  summaryId: string,
  actor: HelpfulActor | null,
): Promise<HelpfulState> {
  await assertPublishedSummary(summaryId, db)
  return readHelpfulState(summaryId, actor, db)
}

export async function addSummaryHelpful(summaryId: string, actor: HelpfulActor): Promise<HelpfulState> {
  const actorUserId = actor.kind === 'user' ? actor.userId : null
  return withAuditContext(
    { source: 'summary-helpful', actorUserId },
    async (tx) => {
      await assertPublishedSummary(summaryId, tx)
      if (actor.kind === 'user' && actor.visitorHash) {
        await mergeVisitorReactions(actor.visitorHash, actor.userId, tx)
      }
      await tx
        .insert(bookSummaryHelpfulReactions)
        .values({ summaryId, ...storedActor(actor) })
        .onConflictDoNothing()
      return readHelpfulState(summaryId, actor, tx)
    },
  )
}

export async function removeSummaryHelpful(
  summaryId: string,
  actor: HelpfulActor | null,
): Promise<HelpfulState> {
  const actorUserId = actor?.kind === 'user' ? actor.userId : null
  return withAuditContext(
    { source: 'summary-helpful', actorUserId },
    async (tx) => {
      await assertPublishedSummary(summaryId, tx)
      if (actor?.kind === 'user' && actor.visitorHash) {
        await mergeVisitorReactions(actor.visitorHash, actor.userId, tx)
      }
      if (actor) {
        await tx.delete(bookSummaryHelpfulReactions).where(actorWhere(summaryId, actor))
      }
      return readHelpfulState(summaryId, actor, tx)
    },
  )
}

export async function reconcileSummaryHelpful(
  summaryId: string,
  userId: string,
  visitorHash?: string,
): Promise<HelpfulState> {
  return withAuditContext(
    { source: 'summary-helpful', actorUserId: userId },
    async (tx) => {
      await assertPublishedSummary(summaryId, tx)
      if (visitorHash) await mergeVisitorReactions(visitorHash, userId, tx)
      return readHelpfulState(summaryId, { kind: 'user', userId }, tx)
    },
  )
}

export async function getSummaryHelpfulCount(summaryId: string): Promise<number> {
  return (await getSummaryHelpfulState(summaryId, null)).count
}
