import { and, eq, inArray, isNull } from 'drizzle-orm'
import {
  bookPriorities,
  bookSubmissions,
  feedback,
  matchingBookAssignments,
  matchingBookIntents,
  matchingSessionParticipants,
  matchingSessions,
  notificationQueue,
  signupBooks,
  telegramPreauthTokens,
  userActivityEvents,
  userIdentities,
  userMergeEvents,
  users,
} from '@/lib/db/schema'
import type { db as defaultDb } from '@/lib/db'
import type { PersonalBookStatus } from '@/lib/signup-books'
import { enableMatchingLegacyCleanup } from '@/lib/matching/legacy-cleanup'

type Tx = typeof defaultDb

export class MergeValidationError extends Error {}
export class MissingMergeUserError extends Error {}
export class IdentityConflictError extends Error {}

export interface MergeRequestInput {
  sourceUserId?: unknown
  targetUserId?: unknown
  reason?: unknown
  currentAdminUserId?: string | null
}

export interface ValidatedMergeRequest {
  sourceUserId: string
  targetUserId: string
  reason: string
}

export interface MergeUsersInput extends ValidatedMergeRequest {
  actorUserId?: string | null
}

export interface SignupMergeRow {
  userId?: string
  bookId: string
  signedAt: Date
  personalStatus: PersonalBookStatus
  personalStatusUpdatedAt: Date | null
}

export interface PriorityMergeRow {
  userId?: string
  bookId: string
  rank: number
  rankSource?: 'auto' | 'manual'
  updatedAt?: Date
}

export interface ActivityMergeRow {
  id: string
  dedupeKey: string | null
}

export interface MatchingAssignmentMergeRow {
  sessionId: string
  userId: string
  bookId: string
  source: 'hard' | 'conditional' | 'admin' | 'legacy'
  assignedAt: Date
  assignedBy: string | null
  circleId: string | null
}

export interface MatchingIntentMergeRow {
  sessionId: string
  userId: string
  bookId: string
  kind: 'conditional' | 'hard'
  createdAt: Date
  updatedAt: Date
}

export function resolveCanonicalMatchingMerge(input: {
  targetUserId: string
  targetAssignments: MatchingAssignmentMergeRow[]
  sourceAssignments: MatchingAssignmentMergeRow[]
  targetIntents: MatchingIntentMergeRow[]
  sourceIntents: MatchingIntentMergeRow[]
}) {
  const sessionIds = new Set([
    ...input.targetAssignments.map(row => row.sessionId),
    ...input.sourceAssignments.map(row => row.sessionId),
    ...input.targetIntents.map(row => row.sessionId),
    ...input.sourceIntents.map(row => row.sessionId),
  ])
  const assignments: MatchingAssignmentMergeRow[] = []
  const intents: MatchingIntentMergeRow[] = []

  for (const sessionId of Array.from(sessionIds)) {
    const assignment = input.targetAssignments.find(row => row.sessionId === sessionId) ??
      input.sourceAssignments.find(row => row.sessionId === sessionId)
    if (assignment) {
      assignments.push({ ...assignment, userId: input.targetUserId })
      continue
    }

    const target = input.targetIntents.filter(row => row.sessionId === sessionId)
    const source = input.sourceIntents.filter(row => row.sessionId === sessionId)
    const hard = target.find(row => row.kind === 'hard') ?? source.find(row => row.kind === 'hard')
    if (hard) {
      intents.push({ ...hard, userId: input.targetUserId })
      continue
    }
    const byBook = new Map<string, MatchingIntentMergeRow>()
    for (const row of [...target, ...source]) {
      if (!byBook.has(row.bookId)) byBook.set(row.bookId, { ...row, userId: input.targetUserId })
    }
    intents.push(...Array.from(byBook.values()))
  }
  return { assignments, intents }
}

const statusStrength: Record<Exclude<PersonalBookStatus, null>, number> = {
  reading: 1,
  read: 2,
}

function strength(status: PersonalBookStatus) {
  return status ? statusStrength[status] : 0
}

function newestDate(left: Date | null, right: Date | null) {
  if (!left) return right
  if (!right) return left
  return left > right ? left : right
}

export function validateMergeRequest(input: MergeRequestInput): ValidatedMergeRequest {
  const sourceUserId = typeof input.sourceUserId === 'string' ? input.sourceUserId.trim() : ''
  const targetUserId = typeof input.targetUserId === 'string' ? input.targetUserId.trim() : ''
  const reason = typeof input.reason === 'string' ? input.reason.trim() : ''

  if (!sourceUserId) throw new MergeValidationError('sourceUserId is required')
  if (!targetUserId) throw new MergeValidationError('targetUserId is required')
  if (sourceUserId === targetUserId) throw new MergeValidationError('source and target users must differ')
  if (input.currentAdminUserId && sourceUserId === input.currentAdminUserId) {
    throw new MergeValidationError('admin cannot merge their own account as source')
  }

  return { sourceUserId, targetUserId, reason }
}

export function resolveSignupMerge(
  targetRows: SignupMergeRow[],
  sourceRows: SignupMergeRow[],
  targetUserId: string,
): SignupMergeRow[] {
  const byBook = new Map<string, SignupMergeRow>()

  for (const row of [...targetRows, ...sourceRows]) {
    const current = byBook.get(row.bookId)
    if (!current) {
      byBook.set(row.bookId, { ...row, userId: targetUserId })
      continue
    }

    const currentStrength = strength(current.personalStatus)
    const nextStrength = strength(row.personalStatus)
    const strongerStatus = nextStrength > currentStrength ? row.personalStatus : current.personalStatus
    const statusTimestamp = nextStrength === currentStrength
      ? newestDate(current.personalStatusUpdatedAt, row.personalStatusUpdatedAt)
      : nextStrength > currentStrength
        ? row.personalStatusUpdatedAt
        : current.personalStatusUpdatedAt

    byBook.set(row.bookId, {
      ...current,
      userId: targetUserId,
      signedAt: current.signedAt < row.signedAt ? current.signedAt : row.signedAt,
      personalStatus: strongerStatus,
      personalStatusUpdatedAt: statusTimestamp,
    })
  }

  return Array.from(byBook.values()).sort((a, b) => a.signedAt.getTime() - b.signedAt.getTime())
}

export function mergePriorityRows(
  targetRows: PriorityMergeRow[],
  sourceRows: PriorityMergeRow[],
  targetUserId: string,
): Required<PriorityMergeRow>[] {
  const sortedTarget = [...targetRows].sort((a, b) => a.rank - b.rank)
  const seen = new Set(sortedTarget.map(row => row.bookId))
  const sourceOnly = [...sourceRows]
    .filter(row => !seen.has(row.bookId))
    .sort((a, b) => a.rank - b.rank)
  const now = new Date()

  return [...sortedTarget, ...sourceOnly].map((row, index) => ({
    userId: targetUserId,
    bookId: row.bookId,
    rank: index + 1,
    rankSource: row.rankSource ?? 'auto',
    updatedAt: row.updatedAt ?? now,
  }))
}

/**
 * Согласует book_priorities со статусами signup_books после слияния аккаунтов.
 *
 * Инвариант обязательных рангов (PR #466): у записи signup_books с
 * personal_status=null — ровно одна строка book_priorities; у reading/read — ни одной.
 * mergeUsers считает mergedSignups и mergedPriorities независимо (union по bookId),
 * поэтому после слияния книга может оказаться reading/read с рангом (ранг выжил из
 * одного аккаунта, статус усилился из другого) или null без ранга. Приводим к инварианту:
 *  - выкидываем ранги у книг со статусом reading/read (и у осиротевших без signup);
 *  - дописываем auto-ранги книгам с personal_status=null без ранга (порядок — по signedAt);
 *  - компактизируем ранги в 1..N, сохраняя rankSource уже существующих строк.
 */
export function reconcilePrioritiesWithSignups(
  signups: SignupMergeRow[],
  priorities: Required<PriorityMergeRow>[],
  targetUserId: string,
): Required<PriorityMergeRow>[] {
  const priorityByBook = new Map(priorities.map(row => [row.bookId, row]))
  const now = new Date()

  const rankableBooks = signups
    .filter(row => row.personalStatus === null)
    .sort((a, b) => a.signedAt.getTime() - b.signedAt.getTime())

  const kept = rankableBooks
    .map(row => priorityByBook.get(row.bookId))
    .filter((row): row is Required<PriorityMergeRow> => Boolean(row))
    .sort((a, b) => a.rank - b.rank)

  const keptBooks = new Set(kept.map(row => row.bookId))
  const appended = rankableBooks
    .filter(row => !keptBooks.has(row.bookId))
    .map(row => ({ bookId: row.bookId, rankSource: 'auto' as const, updatedAt: now }))

  return [...kept, ...appended].map((row, index) => ({
    userId: targetUserId,
    bookId: row.bookId,
    rank: index + 1,
    rankSource: row.rankSource ?? 'auto',
    updatedAt: row.updatedAt ?? now,
  }))
}

export function sourceActivityIdsToDrop(
  targetRows: ActivityMergeRow[],
  sourceRows: ActivityMergeRow[],
): string[] {
  const targetDedupeKeys = new Set(targetRows.map(row => row.dedupeKey).filter((key): key is string => Boolean(key)))
  return sourceRows
    .filter(row => row.dedupeKey && targetDedupeKeys.has(row.dedupeKey))
    .map(row => row.id)
}

function snapshotUser(user: { id: string; name: string | null; contactEmail: string | null; contacts: string | null; createdAt: Date | null }) {
  return {
    id: user.id,
    name: user.name,
    contactEmail: user.contactEmail,
    contacts: user.contacts,
    createdAt: user.createdAt?.toISOString?.() ?? null,
  }
}

async function replaceRows<T extends object>(
  tx: Tx,
  table: unknown,
  userColumn: unknown,
  userIds: string[],
  rows: T[],
) {
  await tx.delete(table as never).where(inArray(userColumn as never, userIds))
  if (rows.length > 0) await tx.insert(table as never).values(rows as never)
}

export async function mergeUsers(tx: Tx, input: MergeUsersInput) {
  const { sourceUserId, targetUserId, reason, actorUserId = null } = input
  const [sourceUser] = await tx.select().from(users).where(eq(users.id, sourceUserId)).limit(1)
  const [targetUser] = await tx.select().from(users).where(eq(users.id, targetUserId)).limit(1)

  if (!sourceUser) throw new MissingMergeUserError('source user not found')
  if (!targetUser) throw new MissingMergeUserError('target user not found')

  await enableMatchingLegacyCleanup(tx)

  const [sourceIdentityRows, targetIdentityRows, sourceSignupRows, targetSignupRows, sourcePriorityRows, targetPriorityRows,
    sourceAssignmentRows, targetAssignmentRows, sourceIntentRows, targetIntentRows] = await Promise.all([
    tx.select().from(userIdentities).where(eq(userIdentities.userId, sourceUserId)),
    tx.select().from(userIdentities).where(eq(userIdentities.userId, targetUserId)),
    tx.select().from(signupBooks).where(eq(signupBooks.userId, sourceUserId)),
    tx.select().from(signupBooks).where(eq(signupBooks.userId, targetUserId)),
    tx.select().from(bookPriorities).where(eq(bookPriorities.userId, sourceUserId)),
    tx.select().from(bookPriorities).where(eq(bookPriorities.userId, targetUserId)),
    tx.select().from(matchingBookAssignments).where(eq(matchingBookAssignments.userId, sourceUserId)),
    tx.select().from(matchingBookAssignments).where(eq(matchingBookAssignments.userId, targetUserId)),
    tx.select().from(matchingBookIntents).where(eq(matchingBookIntents.userId, sourceUserId)),
    tx.select().from(matchingBookIntents).where(eq(matchingBookIntents.userId, targetUserId)),
  ])

  const targetIdentityKeys = new Set(targetIdentityRows.map(row => `${row.provider}\u0000${row.providerAccountId}`))
  const duplicateSourceIdentityIds = sourceIdentityRows
    .filter(row => targetIdentityKeys.has(`${row.provider}\u0000${row.providerAccountId}`))
    .map(row => row.id)

  if (duplicateSourceIdentityIds.length > 0) {
    await tx.delete(userIdentities).where(inArray(userIdentities.id, duplicateSourceIdentityIds))
  }

  const conflictingIdentity = sourceIdentityRows.find(row => row.userId !== sourceUserId)
  if (conflictingIdentity) {
    throw new IdentityConflictError(`identity ${conflictingIdentity.provider} belongs to another user`)
  }

  let mergedSignups = resolveSignupMerge(
    targetSignupRows.map(row => ({
      userId: targetUserId,
      bookId: row.bookId,
      signedAt: row.signedAt,
      personalStatus: (row.personalStatus ?? null) as PersonalBookStatus,
      personalStatusUpdatedAt: row.personalStatusUpdatedAt ?? null,
    })),
    sourceSignupRows.map(row => ({
      userId: sourceUserId,
      bookId: row.bookId,
      signedAt: row.signedAt,
      personalStatus: (row.personalStatus ?? null) as PersonalBookStatus,
      personalStatusUpdatedAt: row.personalStatusUpdatedAt ?? null,
    })),
    targetUserId,
  )

  const mergedCanonical = resolveCanonicalMatchingMerge({
    targetUserId,
    targetAssignments: targetAssignmentRows,
    sourceAssignments: sourceAssignmentRows,
    targetIntents: targetIntentRows,
    sourceIntents: sourceIntentRows,
  })
  const canonicallyBoundBooks = new Set([
    ...mergedCanonical.assignments.map(row => row.bookId),
    ...mergedCanonical.intents.map(row => row.bookId),
  ])
  mergedSignups = mergedSignups.map(row => canonicallyBoundBooks.has(row.bookId)
    ? { ...row, personalStatus: null, personalStatusUpdatedAt: null }
    : row)

  const mergedPriorities = mergePriorityRows(
    targetPriorityRows.map(row => ({ userId: targetUserId, bookId: row.bookId, rank: row.rank, rankSource: row.rankSource, updatedAt: row.updatedAt })),
    sourcePriorityRows.map(row => ({ userId: sourceUserId, bookId: row.bookId, rank: row.rank, rankSource: row.rankSource, updatedAt: row.updatedAt })),
    targetUserId,
  )

  // mergedSignups и mergedPriorities посчитаны независимо — приводим ранги к
  // инварианту обязательных рангов (см. reconcilePrioritiesWithSignups).
  const reconciledPriorities = reconcilePrioritiesWithSignups(mergedSignups, mergedPriorities, targetUserId)

  await tx.delete(matchingBookAssignments).where(inArray(matchingBookAssignments.userId, [sourceUserId, targetUserId]))
  await tx.delete(matchingBookIntents).where(inArray(matchingBookIntents.userId, [sourceUserId, targetUserId]))
  await replaceRows(tx, signupBooks, signupBooks.userId, [sourceUserId, targetUserId], mergedSignups)
  await replaceRows(tx, bookPriorities, bookPriorities.userId, [sourceUserId, targetUserId], reconciledPriorities)

  await tx.update(userIdentities).set({ userId: targetUserId }).where(eq(userIdentities.userId, sourceUserId))
  await tx.update(bookSubmissions).set({ userId: targetUserId }).where(eq(bookSubmissions.userId, sourceUserId))
  await tx.update(feedback).set({ userId: targetUserId }).where(eq(feedback.userId, sourceUserId))

  const [sourceActivityRows, targetActivityRows] = await Promise.all([
    tx.select({ id: userActivityEvents.id, dedupeKey: userActivityEvents.dedupeKey }).from(userActivityEvents).where(eq(userActivityEvents.userId, sourceUserId)),
    tx.select({ id: userActivityEvents.id, dedupeKey: userActivityEvents.dedupeKey }).from(userActivityEvents).where(eq(userActivityEvents.userId, targetUserId)),
  ])
  const duplicateActivityIds = sourceActivityIdsToDrop(targetActivityRows, sourceActivityRows)
  if (duplicateActivityIds.length > 0) {
    await tx.delete(userActivityEvents).where(inArray(userActivityEvents.id, duplicateActivityIds))
  }
  await tx.update(userActivityEvents).set({ userId: targetUserId }).where(eq(userActivityEvents.userId, sourceUserId))

  await tx.update(telegramPreauthTokens).set({ userId: targetUserId }).where(eq(telegramPreauthTokens.userId, sourceUserId))
  await tx.update(matchingSessions).set({ createdBy: targetUserId }).where(eq(matchingSessions.createdBy, sourceUserId))
  const [sourceParticipants, targetParticipants] = await Promise.all([
    tx.select().from(matchingSessionParticipants).where(eq(matchingSessionParticipants.userId, sourceUserId)),
    tx.select().from(matchingSessionParticipants).where(eq(matchingSessionParticipants.userId, targetUserId)),
  ])

  const targetParticipantSessions = new Set(targetParticipants.map(row => row.sessionId))
  for (const row of sourceParticipants) {
    if (targetParticipantSessions.has(row.sessionId)) {
      await tx.delete(matchingSessionParticipants).where(and(
        eq(matchingSessionParticipants.sessionId, row.sessionId),
        eq(matchingSessionParticipants.userId, sourceUserId),
      ))
    } else {
      await tx.update(matchingSessionParticipants).set({ userId: targetUserId }).where(and(
        eq(matchingSessionParticipants.sessionId, row.sessionId),
        eq(matchingSessionParticipants.userId, sourceUserId),
      ))
    }
  }

  if (mergedCanonical.assignments.length > 0) {
    await tx.insert(matchingBookAssignments).values(mergedCanonical.assignments)
  }
  if (mergedCanonical.intents.length > 0) {
    await tx.insert(matchingBookIntents).values(mergedCanonical.intents)
  }

  if (sourceUser.contactEmail && targetUser.contactEmail) {
    await tx
      .update(notificationQueue)
      .set({
        userName: targetUser.name ?? '',
        userEmail: targetUser.contactEmail,
        contacts: targetUser.contacts ?? '',
      })
      .where(and(eq(notificationQueue.userEmail, sourceUser.contactEmail), isNull(notificationQueue.sentAt)))
  }

  await tx.update(users).set({
    prioritiesSet: targetUser.prioritiesSet || reconciledPriorities.length > 0,
    lastActivityAt: newestDate(targetUser.lastActivityAt, sourceUser.lastActivityAt),
  }).where(eq(users.id, targetUserId))

  const movedCounts = {
    userIdentities: sourceIdentityRows.length - duplicateSourceIdentityIds.length,
    signupBooks: sourceSignupRows.length,
    bookPriorities: sourcePriorityRows.length,
    userActivityEvents: sourceActivityRows.length - duplicateActivityIds.length,
    matchingSessionParticipants: sourceParticipants.length,
    matchingBookAssignments: sourceAssignmentRows.length,
    matchingBookIntents: sourceIntentRows.length,
  }

  await tx.insert(userMergeEvents).values({
    actorUserId,
    sourceUserId,
    targetUserId,
    reason,
    sourceSnapshot: snapshotUser(sourceUser),
    targetSnapshot: snapshotUser(targetUser),
    movedCounts,
  })

  await tx.delete(users).where(eq(users.id, sourceUserId))

  return {
    sourceUserId,
    targetUserId,
    movedCounts,
  }
}
