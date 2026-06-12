import { and, eq, inArray, isNull } from 'drizzle-orm'
import {
  bookPriorities,
  bookSubmissions,
  feedback,
  matchingPreferenceEvents,
  matchingPseudonymReservations,
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
  updatedAt?: Date
}

export interface ActivityMergeRow {
  id: string
  dedupeKey: string | null
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
  if (!reason) throw new MergeValidationError('reason is required')
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

  const [sourceIdentityRows, targetIdentityRows, sourceSignupRows, targetSignupRows, sourcePriorityRows, targetPriorityRows] = await Promise.all([
    tx.select().from(userIdentities).where(eq(userIdentities.userId, sourceUserId)),
    tx.select().from(userIdentities).where(eq(userIdentities.userId, targetUserId)),
    tx.select().from(signupBooks).where(eq(signupBooks.userId, sourceUserId)),
    tx.select().from(signupBooks).where(eq(signupBooks.userId, targetUserId)),
    tx.select().from(bookPriorities).where(eq(bookPriorities.userId, sourceUserId)),
    tx.select().from(bookPriorities).where(eq(bookPriorities.userId, targetUserId)),
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

  const mergedSignups = resolveSignupMerge(
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

  const mergedPriorities = mergePriorityRows(
    targetPriorityRows.map(row => ({ userId: targetUserId, bookId: row.bookId, rank: row.rank, updatedAt: row.updatedAt })),
    sourcePriorityRows.map(row => ({ userId: sourceUserId, bookId: row.bookId, rank: row.rank, updatedAt: row.updatedAt })),
    targetUserId,
  )

  await replaceRows(tx, signupBooks, signupBooks.userId, [sourceUserId, targetUserId], mergedSignups)
  await replaceRows(tx, bookPriorities, bookPriorities.userId, [sourceUserId, targetUserId], mergedPriorities)

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
  await tx.update(matchingPreferenceEvents).set({ userId: targetUserId }).where(eq(matchingPreferenceEvents.userId, sourceUserId))
  await tx.update(matchingPreferenceEvents).set({ actorUserId: targetUserId }).where(eq(matchingPreferenceEvents.actorUserId, sourceUserId))

  const [sourceParticipants, targetParticipants, sourceReservations, targetReservations] = await Promise.all([
    tx.select().from(matchingSessionParticipants).where(eq(matchingSessionParticipants.userId, sourceUserId)),
    tx.select().from(matchingSessionParticipants).where(eq(matchingSessionParticipants.userId, targetUserId)),
    tx.select().from(matchingPseudonymReservations).where(eq(matchingPseudonymReservations.userId, sourceUserId)),
    tx.select().from(matchingPseudonymReservations).where(eq(matchingPseudonymReservations.userId, targetUserId)),
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

  const targetReservationSessions = new Set(targetReservations.map(row => row.sessionId))
  for (const row of sourceReservations) {
    if (targetReservationSessions.has(row.sessionId)) {
      await tx.delete(matchingPseudonymReservations).where(and(
        eq(matchingPseudonymReservations.sessionId, row.sessionId),
        eq(matchingPseudonymReservations.userId, sourceUserId),
      ))
    } else {
      await tx.update(matchingPseudonymReservations).set({ userId: targetUserId }).where(and(
        eq(matchingPseudonymReservations.sessionId, row.sessionId),
        eq(matchingPseudonymReservations.userId, sourceUserId),
      ))
    }
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
    prioritiesSet: targetUser.prioritiesSet || mergedPriorities.length > 0,
    lastActivityAt: newestDate(targetUser.lastActivityAt, sourceUser.lastActivityAt),
  }).where(eq(users.id, targetUserId))

  const movedCounts = {
    userIdentities: sourceIdentityRows.length - duplicateSourceIdentityIds.length,
    signupBooks: sourceSignupRows.length,
    bookPriorities: sourcePriorityRows.length,
    userActivityEvents: sourceActivityRows.length - duplicateActivityIds.length,
    matchingSessionParticipants: sourceParticipants.length,
    matchingPseudonymReservations: sourceReservations.length,
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
