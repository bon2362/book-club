import { db } from '@/lib/db'
import {
  bookPriorities,
  bookSubmissions,
  feedback,
  signupBooks,
  users,
} from '@/lib/db/schema'
import { asc, desc, eq } from 'drizzle-orm'

export interface AdminUserSummary {
  id: string
  name: string
  email: string
  contacts: string | null
  telegramUsername: string | null
  authProvider: string | null
  lastSignInAt: string | null
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

export function getTelegramDisplay(user: { telegramUsername?: string | null; contacts?: string | null }) {
  if (user.telegramUsername) return `@${user.telegramUsername.replace(/^@/, '')}`
  const contacts = user.contacts?.trim()
  if (contacts?.startsWith('@')) return contacts
  return contacts ?? ''
}

export async function getAdminUserSummaries(): Promise<AdminUserSummary[]> {
  const [userRows, signupRows] = await Promise.all([
    db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        emailVerified: users.emailVerified,
        contacts: users.contacts,
        telegramUsername: users.telegramUsername,
        authProvider: users.authProvider,
        lastSignInAt: users.lastSignInAt,
        languages: users.languages,
        isAdmin: users.isAdmin,
      })
      .from(users)
      .orderBy(asc(users.name), asc(users.email)),
    db.select({ userId: signupBooks.userId }).from(signupBooks),
  ])

  return buildAdminUserSummaries(userRows, signupRows)
}

export function buildAdminUserSummaries(
  userRows: {
    id: string
    name: string | null
    email: string
    contacts: string | null
    telegramUsername: string | null
    authProvider: string | null
    lastSignInAt: Date | null
    emailVerified: Date | null
    languages: string | null
    isAdmin?: boolean | null
  }[],
  signupRows: { userId: string }[]
): AdminUserSummary[] {
  const counts = new Map<string, number>()
  for (const row of signupRows) counts.set(row.userId, (counts.get(row.userId) ?? 0) + 1)

  return userRows.map(row => ({
    id: row.id,
    name: row.name ?? '',
    email: row.email,
    contacts: row.contacts,
    telegramUsername: row.telegramUsername,
    authProvider: row.authProvider,
    lastSignInAt: dateToIso(row.lastSignInAt),
    createdAt: dateToIso(row.emailVerified),
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
      email: users.email,
      emailVerified: users.emailVerified,
      contacts: users.contacts,
      telegramUsername: users.telegramUsername,
      authProvider: users.authProvider,
      lastSignInAt: users.lastSignInAt,
      languages: users.languages,
      prioritiesSet: users.prioritiesSet,
      isAdmin: users.isAdmin,
    })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  if (!userRow) return null

  const [signupRows, priorityRows, submissionRows, feedbackRows] = await Promise.all([
    db
      .select({ bookName: signupBooks.bookName, signedAt: signupBooks.signedAt })
      .from(signupBooks)
      .where(eq(signupBooks.userId, userId))
      .orderBy(asc(signupBooks.signedAt), asc(signupBooks.bookName)),
    db
      .select({ bookName: bookPriorities.bookName, rank: bookPriorities.rank })
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
        userEmail: users.email,
      })
      .from(feedback)
      .leftJoin(users, eq(feedback.userId, users.id))
      .where(eq(feedback.userId, userId))
      .orderBy(desc(feedback.createdAt)),
  ])

  const summary = buildAdminUserSummaries([userRow], signupRows.map(() => ({ userId })))[0]

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
      userEmail: users.email,
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
  }))
}
