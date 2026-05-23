export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { bookSubmissions, signupBooks, bookPriorities, users, books } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { Resend } from 'resend'
import { approvedEmail, rejectedEmail } from '@/lib/email-templates/submission-status'
import { getUserContactEmail } from '@/lib/user-email'
import { publishSubmissionAsBook } from '@/lib/book-publish'

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = params
  const deleted = await db
    .delete(bookSubmissions)
    .where(eq(bookSubmissions.id, id))
    .returning()

  if (deleted.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}

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
  const { status, title, author, whyRead, topic, pages, publishedDate, textUrl, description, coverUrl, rejectionReason } = body

  const [existing] = await db
    .select({ title: bookSubmissions.title, status: bookSubmissions.status })
    .from(bookSubmissions)
    .where(eq(bookSubmissions.id, id))
    .limit(1)

  if (!existing) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

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
  if (rejectionReason !== undefined) updates.rejectionReason = rejectionReason

  const updated = await db
    .update(bookSubmissions)
    .set(updates)
    .where(eq(bookSubmissions.id, id))
    .returning()

  if (updated.length === 0) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const submission = updated[0]

  const titleChanged = title !== undefined && title !== existing.title
  const isApproved = submission.status === 'approved'

  if (isApproved) {
    // Promote (or sync) the approved submission to a row in `books` and
    // record the submitter's signup via book_id.
    await publishSubmissionAsBook({
      id: submission.id,
      userId: submission.userId,
      title: submission.title,
      author: submission.author,
      topic: submission.topic,
      pages: submission.pages,
      publishedDate: submission.publishedDate,
      textUrl: submission.textUrl,
      description: submission.description,
      coverUrl: submission.coverUrl,
      whyRead: submission.whyRead,
    })
  }

  if (titleChanged && isApproved) {
    // Update the cached title on `books` is handled inside publishSubmissionAsBook.
    // Keep the legacy book_name caches in sync until cleanup migration 0022 runs.
    await Promise.all([
      db.update(signupBooks)
        .set({ bookName: title })
        .where(eq(signupBooks.bookName, existing.title)),
      db.update(bookPriorities)
        .set({ bookName: title })
        .where(eq(bookPriorities.bookName, existing.title)),
      db.update(books)
        .set({ title })
        .where(eq(books.sourceSubmissionId, submission.id)),
    ])
  }

  if (status === 'approved' || status === 'rejected') {
    const [userRow] = await db
      .select({ contactEmail: users.contactEmail })
      .from(users)
      .where(eq(users.id, submission.userId))
      .limit(1)

    const contactEmail = getUserContactEmail(userRow)

    if (contactEmail) {
      const template = status === 'approved'
        ? approvedEmail(submission.title)
        : rejectedEmail(submission.title, submission.rejectionReason)
      try {
        const resend = new Resend(process.env.RESEND_API_KEY!)
        await resend.emails.send({ from: FROM, to: contactEmail, ...template })
      } catch (e) {
        console.error('Email send failed:', e)
      }
    }
  }

  return NextResponse.json({ success: true, data: submission })
}
