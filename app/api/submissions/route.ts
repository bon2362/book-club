export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { bookSubmissions } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'
import { bestEffortRecordUserActivity } from '@/lib/user-activity'
import { withAuditContext } from '@/lib/audit/with-audit-context'

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

  // Захватываем в const до замыкания: внутри async (tx) => {} TS теряет
  // сужение property-доступа session.user.id и снова считает его string|undefined.
  const userId = session.user.id

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

  const result = await withAuditContext(
    {
      actorUserId: userId,
      actorLabel: session.user.name ?? session.user.contactEmail ?? null,
      source: 'submission',
    },
    async (tx) => {
      const rows = await tx.insert(bookSubmissions).values({
        userId,
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
      return rows
    },
  )

  await bestEffortRecordUserActivity(session.user.id, 'submission_created', {
    occurredAt: result[0].createdAt,
    source: 'api',
    sourceId: result[0].id,
    dedupeKey: `api:submission_created:${result[0].id}`,
    metadata: {
      title,
      author,
    },
  })

  return NextResponse.json({ success: true, data: result[0] }, { status: 201 })
}
