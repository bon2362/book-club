import { db, sql } from '@/lib/db'
import { books, bookSubmissions } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import crypto from 'node:crypto'

interface SubmissionForPublish {
  id: string
  userId: string
  title: string
  author: string
  topic: string | null
  pages: number | null
  publishedDate: string | null
  textUrl: string | null
  description: string | null
  coverUrl: string | null
  whyRead: string
}

/**
 * Promote an approved submission to a published row in `books` and link the
 * submission via book_submissions.book_id. Idempotent: re-running on an already
 * linked submission updates and returns the existing book_id.
 *
 * Also writes the submission author into signup_books via book_id.
 */
export async function publishSubmissionAsBook(submission: SubmissionForPublish): Promise<string> {
  // Already linked?
  const [existing] = await db
    .select({ bookId: bookSubmissions.bookId })
    .from(bookSubmissions)
    .where(eq(bookSubmissions.id, submission.id))
    .limit(1)

  let bookId: string
  if (existing?.bookId) {
    bookId = existing.bookId
    // Sync title/author/etc. so the catalog reflects post-approval edits.
    await db
      .update(books)
      .set({
        title: submission.title,
        author: submission.author,
        tags: submission.topic ? [submission.topic] : [],
        pages: submission.pages,
        publishedDate: submission.publishedDate ?? '',
        textUrl: submission.textUrl ?? '',
        description: submission.description ?? '',
        coverUrl: submission.coverUrl ?? null,
        whyRead: submission.whyRead || null,
        updatedAt: new Date(),
      })
      .where(eq(books.id, bookId))
  } else {
    bookId = crypto.randomUUID()
    const now = new Date()
    await db.insert(books).values({
      id: bookId,
      title: submission.title,
      author: submission.author,
      tags: submission.topic ? [submission.topic] : [],
      type: 'book',
      size: '',
      pages: submission.pages,
      publishedDate: submission.publishedDate ?? '',
      textUrl: submission.textUrl ?? '',
      description: submission.description ?? '',
      coverUrl: submission.coverUrl ?? null,
      whyRead: submission.whyRead || null,
      recommendationLink: null,
      readingStatus: null,
      visibility: 'published',
      isNew: true,
      sortOrder: 0,
      source: 'submission',
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
    })
  }

  await db
    .update(bookSubmissions)
    .set({ bookId })
    .where(eq(bookSubmissions.id, submission.id))

  // Sign up the submitter when the author account still exists.
  // Admin approval should not fail if a test or deleted account removed it first.
  await sql`
    INSERT INTO signup_books (user_id, book_id)
    SELECT ${submission.userId}, ${bookId}
    WHERE EXISTS (SELECT 1 FROM "user" WHERE id = ${submission.userId})
    ON CONFLICT (user_id, book_id) DO NOTHING
  `

  return bookId
}
