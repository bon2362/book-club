export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { bookSubmissions, users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function GET() {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rows = await db
    .select({
      id: bookSubmissions.id,
      userId: bookSubmissions.userId,
      userEmail: users.email,
      title: bookSubmissions.title,
      topic: bookSubmissions.topic,
      author: bookSubmissions.author,
      pages: bookSubmissions.pages,
      publishedDate: bookSubmissions.publishedDate,
      textUrl: bookSubmissions.textUrl,
      description: bookSubmissions.description,
      coverUrl: bookSubmissions.coverUrl,
      whyRead: bookSubmissions.whyRead,
      status: bookSubmissions.status,
      createdAt: bookSubmissions.createdAt,
      updatedAt: bookSubmissions.updatedAt,
    })
    .from(bookSubmissions)
    .leftJoin(users, eq(bookSubmissions.userId, users.id))
    .orderBy(bookSubmissions.createdAt)

  return NextResponse.json({ success: true, data: rows })
}
