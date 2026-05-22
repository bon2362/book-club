import { db } from '@/lib/db'
import {
  signupBooks,
  bookPriorities,
  bookSubmissions,
  feedback,
  users,
  userIdentities,
} from '@/lib/db/schema'
import { asc, desc, eq } from 'drizzle-orm'
import { formatTelegramDisplay } from '@/lib/telegram-display'

export interface AdminUserSummary {
  id: string
  name: string
  email: string | null
  contactEmail: string | null
  contacts: string | null
  telegramUsername: string | null
  telegramDisplay: string
  authProvider: string | null
  lastActivityAt: string | null
  createdAt: string | null
  languages: string[]
  booksCount: number
  isAdmin: boolean
}

export interface AdminUserDetails {
  user: AdminUserSummary & { prioritiesSet: boolean }
  signupBooks: { bookName: string; signedAt: string }[]
  priorities: { bookName: string; rank: number }[]
  submissions: {
    id: string
    title: string
    author: string
    status: string
    createdAt: string
  }[]
  feedback: AdminFeedbackItem[]
}

export interface AdminFeedbackItem {
  id: string
  userId: string | null
  name: string | null
  email: string | null
  message: string
  createdAt: string
  userName: string | null
  userEmail: string | null
  userContactEmail: string | null
}

function parseLanguages(value: string | null): string[] {
  if (!value) return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : []
  } catch {
    return []
  }
}

function dateToIso(value: Date | null | undefined): string | null {
  return value ? value.toISOString() : null
}

export { formatTelegramDisplay as getTelegramDisplay }

export async function getAdminUserSummaries(): Promise<AdminUserSummary[]> {
  const [userRows, signupRows, identityRows] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.contactEmail,
        contactEmail: users.contactEmail,
        emailVerified: users.emailVerified,
        createdAt: users.createdAt,
        contacts: users.contacts,
        telegramUsername: users.telegramUsername,
        authProvider: users.authProvider,
        lastSignInAt: users.lastSignInAt,
        lastActivityAt: users.lastActivityAt,
        languages: users.languages,
        isAdmin: users.isAdmin,
      })
      .from(users)
      .orderBy(asc(users.name), asc(users.contactEmail)),
    db.select({ userId: signupBooks.userId, activityAt: signupBooks.signedAt }).from(signupBooks),
    db
      .select({
        userId: userIdentities.userId,
        provider: userIdentities.provider,
        lastSeenAt: userIdentities.lastSeenAt,
      })
      .from(userIdentities)
      .orderBy(desc(userIdentities.lastSeenAt)),
  ])

  return buildAdminUserSummaries(userRows, signupRows, identityRows)
}

export function buildAdminUserSummaries(
  userRows: {
    id: string
    name: string | null
    email: string | null
    contactEmail?: string | null
    contacts: string | null
    telegramUsername: string | null
    authProvider?: string | null
    lastSignInAt?: Date | null
    lastActivityAt: Date | null
    emailVerified: Date | null
    createdAt: Date
    languages: string | null
    isAdmin?: boolean | null
  }[],
  signupRows: { userId: string; activityAt?: Date }[],
  identityRows: { userId: string; provider: string; lastSeenAt: Date }[] = []
): AdminUserSummary[] {
  const counts = new Map<string, number>()
  for (const row of signupRows) {
    counts.set(row.userId, (counts.get(row.userId) ?? 0) + 1)
  }
  const latestProviders = new Map<string, { provider: string; lastSeenAt: Date }>()
  for (const row of identityRows) {
    const current = latestProviders.get(row.userId)
    if (!current || current.lastSeenAt < row.lastSeenAt) {
      latestProviders.set(row.userId, { provider: row.provider, lastSeenAt: row.lastSeenAt })
    }
  }

  return userRows.map(row => ({
    id: row.id,
    name: row.name ?? '',
    email: row.email,
    contactEmail: row.contactEmail ?? null,
    contacts: row.contacts,
    telegramUsername: row.telegramUsername,
    telegramDisplay: formatTelegramDisplay(row),
    authProvider: latestProviders.get(row.id)?.provider ?? row.authProvider ?? null,
    lastActivityAt: dateToIso(row.lastActivityAt),
    createdAt: dateToIso(row.createdAt),
    languages: parseLanguages(row.languages),
    booksCount: counts.get(row.id) ?? 0,
    isAdmin: row.isAdmin ?? false,
  }))
}

export async function getAdminUserDetails(userId: string): Promise<AdminUserDetails | null> {
  const [userRow] = await db
    .select({
      id: users.id,
      name: users.name,
      email: users.contactEmail,
      contactEmail: users.contactEmail,
      emailVerified: users.emailVerified,
      createdAt: users.createdAt,
      contacts: users.contacts,
      telegramUsername: users.telegramUsername,
      authProvider: users.authProvider,
      lastSignInAt: users.lastSignInAt,
      lastActivityAt: users.lastActivityAt,
      languages: users.languages,
      prioritiesSet: users.prioritiesSet,
      isAdmin: users.isAdmin,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!userRow) return null

  const [signupRows, priorityRows, submissionRows, feedbackRows, identityRows] = await Promise.all([
    db
      .select({ bookName: signupBooks.bookName, signedAt: signupBooks.signedAt })
      .from(signupBooks)
      .where(eq(signupBooks.userId, userId))
      .orderBy(asc(signupBooks.signedAt), asc(signupBooks.bookName)),
    db
      .select({ bookName: bookPriorities.bookName, rank: bookPriorities.rank, updatedAt: bookPriorities.updatedAt })
      .from(bookPriorities)
      .where(eq(bookPriorities.userId, userId))
      .orderBy(asc(bookPriorities.rank)),
    db
      .select({
        id: bookSubmissions.id,
        title: bookSubmissions.title,
        author: bookSubmissions.author,
        status: bookSubmissions.status,
        createdAt: bookSubmissions.createdAt,
      })
      .from(bookSubmissions)
      .where(eq(bookSubmissions.userId, userId))
      .orderBy(desc(bookSubmissions.createdAt)),
    db
      .select({
        id: feedback.id,
        userId: feedback.userId,
        name: feedback.name,
        email: feedback.email,
        message: feedback.message,
        createdAt: feedback.createdAt,
        userName: users.name,
        userEmail: users.contactEmail,
        userContactEmail: users.contactEmail,
      })
      .from(feedback)
      .leftJoin(users, eq(feedback.userId, users.id))
      .where(eq(feedback.userId, userId))
      .orderBy(desc(feedback.createdAt)),
    db
      .select({
        userId: userIdentities.userId,
        provider: userIdentities.provider,
        lastSeenAt: userIdentities.lastSeenAt,
      })
      .from(userIdentities)
      .where(eq(userIdentities.userId, userId))
      .orderBy(desc(userIdentities.lastSeenAt))
      .limit(1),
  ])

  const summary = buildAdminUserSummaries(
    [userRow],
    signupRows.map(row => ({ userId, activityAt: row.signedAt })),
    identityRows
  )[0]

  return {
    user: { ...summary, prioritiesSet: userRow.prioritiesSet ?? false },
    signupBooks: signupRows.map(row => ({ bookName: row.bookName, signedAt: row.signedAt.toISOString() })),
    priorities: priorityRows,
    submissions: submissionRows.map(row => ({
      id: row.id,
      title: row.title,
      author: row.author,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    })),
    feedback: feedbackRows.map(row => ({
      id: row.id,
      userId: row.userId,
      name: row.name,
      email: row.email,
      message: row.message,
      createdAt: row.createdAt.toISOString(),
      userName: row.userName,
      userEmail: row.userEmail,
      userContactEmail: row.userContactEmail,
    })),
  }
}

export async function getAdminFeedback(): Promise<AdminFeedbackItem[]> {
  const rows = await db
    .select({
      id: feedback.id,
      userId: feedback.userId,
      name: feedback.name,
      email: feedback.email,
      message: feedback.message,
      createdAt: feedback.createdAt,
      userName: users.name,
      userEmail: users.contactEmail,
      userContactEmail: users.contactEmail,
    })
    .from(feedback)
    .leftJoin(users, eq(feedback.userId, users.id))
    .orderBy(desc(feedback.createdAt))

  return rows.map(row => ({
    id: row.id,
    userId: row.userId,
    name: row.name,
    email: row.email,
    message: row.message,
    createdAt: row.createdAt.toISOString(),
    userName: row.userName,
    userEmail: row.userEmail,
    userContactEmail: row.userContactEmail,
  }))
}
