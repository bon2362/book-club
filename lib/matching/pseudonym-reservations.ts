import { and, eq, gt, ne } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  matchingPseudonymReservations,
  matchingSessionParticipants,
} from '@/lib/db/schema'
import { assignStablePseudonym, assignRandomPseudonymExcluding } from './pseudonyms'

const RESERVATION_TTL_MS = 30 * 60 * 1000
const MAX_ASSIGN_ATTEMPTS = 5

function reservationExpiry(now = new Date()): Date {
  return new Date(now.getTime() + RESERVATION_TTL_MS)
}

export async function getOrCreatePseudonymReservation(
  sessionId: string,
  userId: string,
): Promise<string> {
  const now = new Date()
  const [existing] = await db
    .select({ pseudonym: matchingPseudonymReservations.pseudonym })
    .from(matchingPseudonymReservations)
    .where(
      and(
        eq(matchingPseudonymReservations.sessionId, sessionId),
        eq(matchingPseudonymReservations.userId, userId),
        gt(matchingPseudonymReservations.expiresAt, now),
      ),
    )
    .limit(1)

  if (existing) return existing.pseudonym

  await db
    .delete(matchingPseudonymReservations)
    .where(
      and(
        eq(matchingPseudonymReservations.sessionId, sessionId),
        eq(matchingPseudonymReservations.userId, userId),
      ),
    )

  for (let attempt = 0; attempt < MAX_ASSIGN_ATTEMPTS; attempt++) {
    const taken = await getTakenPseudonyms(sessionId, userId, now)
    const pseudonym = assignStablePseudonym(taken, `${sessionId}:${userId}`)

    const [inserted] = await db
      .insert(matchingPseudonymReservations)
      .values({
        sessionId,
        userId,
        pseudonym,
        reservedAt: now,
        expiresAt: reservationExpiry(now),
      })
      .onConflictDoNothing()
      .returning({
        pseudonym: matchingPseudonymReservations.pseudonym,
      })
    if (inserted) return inserted.pseudonym
  }

  throw new Error('PSEUDONYM_RESERVATION_FAILED')
}

/**
 * Перевыбрать ник на новый случайный свободный (кнопка «другой ник» на welcome-экране).
 * Перезаписывает бронь пользователя. Возвращает новый ник.
 */
export async function rerollPseudonymReservation(
  sessionId: string,
  userId: string,
): Promise<string> {
  const now = new Date()

  const [current] = await db
    .select({ pseudonym: matchingPseudonymReservations.pseudonym })
    .from(matchingPseudonymReservations)
    .where(
      and(
        eq(matchingPseudonymReservations.sessionId, sessionId),
        eq(matchingPseudonymReservations.userId, userId),
        gt(matchingPseudonymReservations.expiresAt, now),
      ),
    )
    .limit(1)
  const currentPseudonym = current?.pseudonym ?? null

  await db
    .delete(matchingPseudonymReservations)
    .where(
      and(
        eq(matchingPseudonymReservations.sessionId, sessionId),
        eq(matchingPseudonymReservations.userId, userId),
      ),
    )

  for (let attempt = 0; attempt < MAX_ASSIGN_ATTEMPTS; attempt++) {
    const taken = await getTakenPseudonyms(sessionId, userId, now)
    const pseudonym = assignRandomPseudonymExcluding(taken, currentPseudonym)

    const [inserted] = await db
      .insert(matchingPseudonymReservations)
      .values({
        sessionId,
        userId,
        pseudonym,
        reservedAt: now,
        expiresAt: reservationExpiry(now),
      })
      .onConflictDoNothing()
      .returning({ pseudonym: matchingPseudonymReservations.pseudonym })
    if (inserted) return inserted.pseudonym
  }

  throw new Error('PSEUDONYM_RESERVATION_FAILED')
}

export async function consumePseudonymReservation(
  sessionId: string,
  userId: string,
): Promise<string | null> {
  const now = new Date()
  const [reservation] = await db
    .select({ pseudonym: matchingPseudonymReservations.pseudonym })
    .from(matchingPseudonymReservations)
    .where(
      and(
        eq(matchingPseudonymReservations.sessionId, sessionId),
        eq(matchingPseudonymReservations.userId, userId),
        gt(matchingPseudonymReservations.expiresAt, now),
      ),
    )
    .limit(1)

  if (!reservation) return null

  await db
    .delete(matchingPseudonymReservations)
    .where(
      and(
        eq(matchingPseudonymReservations.sessionId, sessionId),
        eq(matchingPseudonymReservations.userId, userId),
      ),
    )

  return reservation.pseudonym
}

async function getTakenPseudonyms(
  sessionId: string,
  userId: string,
  now: Date,
): Promise<Set<string>> {
  const [participants, reservations] = await Promise.all([
    db
      .select({ pseudonym: matchingSessionParticipants.pseudonym })
      .from(matchingSessionParticipants)
      .where(eq(matchingSessionParticipants.sessionId, sessionId)),
    db
      .select({ pseudonym: matchingPseudonymReservations.pseudonym })
      .from(matchingPseudonymReservations)
      .where(
        and(
          eq(matchingPseudonymReservations.sessionId, sessionId),
          ne(matchingPseudonymReservations.userId, userId),
          gt(matchingPseudonymReservations.expiresAt, now),
        ),
      ),
  ])

  return new Set([
    ...participants.map((row) => row.pseudonym),
    ...reservations.map((row) => row.pseudonym),
  ])
}
