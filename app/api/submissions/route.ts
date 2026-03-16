export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { bookSubmissions } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const submissions = await db
    .select()
    .from(bookSubmissions)
    .where(eq(bookSubmissions.userId, session.user.id))
    .orderBy(desc(bookSubmissions.createdAt))

  return NextResponse.json({ submissions })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { title, author, whyRead, topic, pages, publishedDate, textUrl, description, coverUrl } = body

  if (!title) {
    return NextResponse.json({ error: 'title is required' }, { status: 400 })
  }
  if (!author) {
    return NextResponse.json({ error: 'author is required' }, { status: 400 })
  }
  if (!whyRead) {
    return NextResponse.json({ error: 'whyRead is required' }, { status: 400 })
  }

  const result = await db.insert(bookSubmissions).values({
    userId: session.user.id,
    title,
    author,
    whyRead,
    topic: topic ?? null,
    pages: pages ?? null,
    publishedDate: publishedDate ?? null,
    textUrl: textUrl ?? null,
    description: description ?? null,
    coverUrl: coverUrl ?? null,
  }).returning()

  return NextResponse.json({ success: true, data: result[0] }, { status: 201 })
}
