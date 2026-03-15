export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { bookSubmissions, users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { Resend } from 'resend'
import { approvedEmail, rejectedEmail } from '@/lib/email-templates/submission-status'

const FROM = 'Долгое наступление <noreply@slowreading.club>'

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = params
  const body = await req.json()
  const { status, title, author, whyRead, topic, pages, publishedDate, textUrl, description, coverUrl } = body

  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (status !== undefined) updates.status = status
  if (title !== undefined) updates.title = title
  if (author !== undefined) updates.author = author
  if (whyRead !== undefined) updates.whyRead = whyRead
  if (topic !== undefined) updates.topic = topic
  if (pages !== undefined) updates.pages = pages
  if (publishedDate !== undefined) updates.publishedDate = publishedDate
  if (textUrl !== undefined) updates.textUrl = textUrl
  if (description !== undefined) updates.description = description
  if (coverUrl !== undefined) updates.coverUrl = coverUrl

  const updated = await db
    .update(bookSubmissions)
    .set(updates)
    .where(eq(bookSubmissions.id, id))
    .returning()

  if (updated.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const submission = updated[0]

  if (status === 'approved' || status === 'rejected') {
    const [userRow] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, submission.userId))
      .limit(1)

    if (userRow?.email) {
      const template = status === 'approved'
        ? approvedEmail(submission.title)
        : rejectedEmail(submission.title)
      try {
        const resend = new Resend(process.env.RESEND_API_KEY!)
        await resend.emails.send({ from: FROM, to: userRow.email, ...template })
      } catch (e) {
        console.error('Email send failed:', e)
      }
    }
  }

  return NextResponse.json({ success: true, data: submission })
}
