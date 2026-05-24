export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { books, signupBooks, bookSubmissions, users } from '@/lib/db/schema'
import { asc, desc, eq, isNotNull, isNull, sql } from 'drizzle-orm'
import { createBook, BookValidationError } from '@/lib/books'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const includeArchived = req.nextUrl.searchParams.get('includeArchived') === '1'
  const whereClause = includeArchived ? undefined : isNull(books.archivedAt)

  const rows = await db
    .select()
    .from(books)
    .where(whereClause as never)
    .orderBy(asc(books.sortOrder), desc(books.publishedAt))

  const [countsByBookId, submitterRows] = await Promise.all([
    db
      .select({ bookId: signupBooks.bookId, count: sql<number>`count(*)::int` })
      .from(signupBooks)
      .groupBy(signupBooks.bookId),
    db
      .select({
        bookId: bookSubmissions.bookId,
        submittedByName: users.name,
        submittedByEmail: users.contactEmail,
      })
      .from(bookSubmissions)
      .innerJoin(users, eq(users.id, bookSubmissions.userId))
      .where(isNotNull(bookSubmissions.bookId)),
  ])

  const countById = new Map(countsByBookId.map(c => [c.bookId, Number(c.count)]))
  const submitterByBookId = new Map(
    submitterRows
      .filter(r => r.bookId != null)
      .map(r => [r.bookId as string, { name: r.submittedByName, email: r.submittedByEmail }])
  )

  const data = rows.map(row => ({
    id: row.id,
    title: row.title,
    author: row.author,
    tags: Array.isArray(row.tags) ? row.tags : [],
    type: row.type,
    pages: row.pages,
    publishedDate: row.publishedDate,
    textUrl: row.textUrl,
    description: row.description,
    coverUrl: row.coverUrl,
    whyRead: row.whyRead,
    recommendationLink: row.recommendationLink,
    readingStatus: row.readingStatus,
    visibility: row.visibility,
    isNew: row.isNew,
    sortOrder: row.sortOrder,
    source: row.source,
    archivedAt: row.archivedAt,
    publishedAt: row.publishedAt,
    hiddenAt: row.hiddenAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    signupCount: countById.get(row.id) ?? 0,
    submittedByName: submitterByBookId.get(row.id)?.name ?? null,
    submittedByEmail: submitterByBookId.get(row.id)?.email ?? null,
  }))

  return NextResponse.json({ success: true, data })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    const body = await req.json()
    const created = await createBook(body)
    // After creation, also fetch raw row so we return DB-shape (admin UI consumes admin shape).
    const [row] = await db.select().from(books).where(eq(books.id, created.id)).limit(1)
    return NextResponse.json({ success: true, data: row })
  } catch (err) {
    if (err instanceof BookValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
