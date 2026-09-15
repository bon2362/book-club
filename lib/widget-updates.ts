import { db } from '@/lib/db'
import {
  bookCollections,
  bookSubmissions,
  bookSummaries,
  books,
  feedback,
  matchingSessionParticipants,
  matchingSessions,
  users,
} from '@/lib/db/schema'
import { and, desc, eq, gt } from 'drizzle-orm'

// Сводка «что нового на сайте» для десктопного виджета владельца.
// Только чтение; доступ — по Bearer WIDGET_TOKEN в /api/widget/updates.

export const WIDGET_ITEMS_LIMIT = 5
// Сколько строк сканируем на категорию. Больше — показываем «100+».
export const WIDGET_SCAN_LIMIT = 100
export const WIDGET_DEFAULT_LOOKBACK_MS = 7 * 24 * 60 * 60 * 1000
export const WIDGET_MAX_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000
export const FEEDBACK_PREVIEW_LENGTH = 80

export type WidgetItem = {
  id: string
  title: string
  subtitle: string | null
  at: string
}

export type WidgetCategory = {
  count: number
  capped: boolean
  items: WidgetItem[]
}

export type WidgetUpdates = {
  generatedAt: string
  since: string
  matchingSession: { id: string; name: string } | null
  users: WidgetCategory
  submissions: WidgetCategory
  summaries: WidgetCategory
  collections: WidgetCategory
  feedback: WidgetCategory
  matching: WidgetCategory
}

// Без since (первый запуск виджета) — за неделю. Глубже 30 дней не смотрим,
// будущее время приравниваем к «сейчас».
export function clampSince(raw: string | null, now: Date): Date {
  const parsed = raw ? new Date(raw) : null
  if (!parsed || Number.isNaN(parsed.getTime())) {
    return new Date(now.getTime() - WIDGET_DEFAULT_LOOKBACK_MS)
  }
  const earliest = now.getTime() - WIDGET_MAX_LOOKBACK_MS
  return new Date(Math.min(Math.max(parsed.getTime(), earliest), now.getTime()))
}

export function preview(text: string, max = FEEDBACK_PREVIEW_LENGTH): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat
}

export function toCategory(rows: WidgetItem[]): WidgetCategory {
  return {
    count: rows.length,
    capped: rows.length >= WIDGET_SCAN_LIMIT,
    items: rows.slice(0, WIDGET_ITEMS_LIMIT),
  }
}

const iso = (d: Date | null) => (d ? d.toISOString() : '')

async function newUsers(since: Date): Promise<WidgetItem[]> {
  const rows = await db
    .select({ id: users.id, name: users.name, at: users.createdAt })
    .from(users)
    .where(gt(users.createdAt, since))
    .orderBy(desc(users.createdAt))
    .limit(WIDGET_SCAN_LIMIT)
  return rows.map(r => ({ id: r.id, title: r.name ?? 'Без имени', subtitle: null, at: iso(r.at) }))
}

async function newSubmissions(since: Date): Promise<WidgetItem[]> {
  const rows = await db
    .select({ id: bookSubmissions.id, title: bookSubmissions.title, author: bookSubmissions.author, at: bookSubmissions.createdAt })
    .from(bookSubmissions)
    .where(and(eq(bookSubmissions.status, 'pending'), gt(bookSubmissions.createdAt, since)))
    .orderBy(desc(bookSubmissions.createdAt))
    .limit(WIDGET_SCAN_LIMIT)
  return rows.map(r => ({ id: r.id, title: r.title, subtitle: r.author, at: iso(r.at) }))
}

async function newSummaries(since: Date): Promise<WidgetItem[]> {
  const rows = await db
    .select({ id: bookSummaries.id, bookTitle: books.title, author: bookSummaries.displayName, at: bookSummaries.submittedAt })
    .from(bookSummaries)
    .innerJoin(books, eq(bookSummaries.bookId, books.id))
    .where(and(eq(bookSummaries.status, 'pending'), gt(bookSummaries.submittedAt, since)))
    .orderBy(desc(bookSummaries.submittedAt))
    .limit(WIDGET_SCAN_LIMIT)
  return rows.map(r => ({ id: r.id, title: r.bookTitle, subtitle: r.author, at: iso(r.at) }))
}

async function newCollections(since: Date): Promise<WidgetItem[]> {
  const rows = await db
    .select({ id: bookCollections.id, title: bookCollections.title, author: bookCollections.displayName, at: bookCollections.submittedAt })
    .from(bookCollections)
    .where(and(eq(bookCollections.status, 'pending'), gt(bookCollections.submittedAt, since)))
    .orderBy(desc(bookCollections.submittedAt))
    .limit(WIDGET_SCAN_LIMIT)
  return rows.map(r => ({ id: r.id, title: r.title, subtitle: r.author || null, at: iso(r.at) }))
}

async function newFeedback(since: Date): Promise<WidgetItem[]> {
  const rows = await db
    .select({ id: feedback.id, name: feedback.name, userName: users.name, message: feedback.message, at: feedback.createdAt })
    .from(feedback)
    .leftJoin(users, eq(feedback.userId, users.id))
    .where(gt(feedback.createdAt, since))
    .orderBy(desc(feedback.createdAt))
    .limit(WIDGET_SCAN_LIMIT)
  return rows.map(r => ({
    id: r.id,
    title: r.name || r.userName || 'Аноним',
    subtitle: preview(r.message),
    at: iso(r.at),
  }))
}

// Открытая сессия всегда одна (уникальный индекс). Добавленных админом
// не показываем — о них владелец и так знает.
async function newMatchingJoins(since: Date) {
  const [session] = await db
    .select({ id: matchingSessions.id, name: matchingSessions.name })
    .from(matchingSessions)
    .where(eq(matchingSessions.status, 'open'))
    .limit(1)
  if (!session) return { session: null, items: [] as WidgetItem[] }

  const rows = await db
    .select({ id: matchingSessionParticipants.userId, name: users.name, at: matchingSessionParticipants.joinedAt })
    .from(matchingSessionParticipants)
    .innerJoin(users, eq(matchingSessionParticipants.userId, users.id))
    .where(and(
      eq(matchingSessionParticipants.sessionId, session.id),
      eq(matchingSessionParticipants.joinSource, 'self'),
      gt(matchingSessionParticipants.joinedAt, since),
    ))
    .orderBy(desc(matchingSessionParticipants.joinedAt))
    .limit(WIDGET_SCAN_LIMIT)
  const items = rows.map(r => ({ id: r.id, title: r.name ?? 'Без имени', subtitle: null, at: iso(r.at) }))
  return { session, items }
}

export async function getWidgetUpdates(since: Date, now: Date): Promise<WidgetUpdates> {
  const [usersRows, submissionsRows, summariesRows, collectionsRows, feedbackRows, matching] = await Promise.all([
    newUsers(since),
    newSubmissions(since),
    newSummaries(since),
    newCollections(since),
    newFeedback(since),
    newMatchingJoins(since),
  ])

  return {
    generatedAt: now.toISOString(),
    since: since.toISOString(),
    matchingSession: matching.session,
    users: toCategory(usersRows),
    submissions: toCategory(submissionsRows),
    summaries: toCategory(summariesRows),
    collections: toCategory(collectionsRows),
    feedback: toCategory(feedbackRows),
    matching: toCategory(matching.items),
  }
}
