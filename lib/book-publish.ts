import { db, sql } from '@/lib/db'
import { books, bookSubmissions, signupBooks } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import crypto from 'node:crypto'

function normalizeKey(title: string, author: string): string {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[ёе]/g, 'е').replace(/[^a-zа-я0-9]+/gi, ' ').trim()
  return `${norm(title)}|${norm(author)}`
}

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
 * submission via book_submissions.book_id. Idempotent: re-running on an
 * already-published submission returns the existing book_id.
 *
 * Also writes the submission author into signup_books with both legacy
 * book_name and new book_id so the runtime stays consistent during the
 * transition.
 */
export async function publishSubmissionAsBook(submission: SubmissionForPublish): Promise<string> {
  // Already linked?
  const [existing] = await db
    .select({ id: books.id })
    .from(books)
    .where(eq(books.sourceSubmissionId, submission.id))
    .limit(1)

  let bookId: string
  if (existing) {
    bookId = existing.id
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
        canonicalKey: normalizeKey(submission.title, submission.author),
        updatedAt: new Date(),
      })
      .where(eq(books.id, bookId))
  } else {
    bookId = crypto.randomUUID()
    const now = new Date()
    await db.insert(books).values({
      id: bookId,
      canonicalKey: normalizeKey(submission.title, submission.author),
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
      sourceSubmissionId: submission.id,
      legacySheetsRowId: null,
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
    })
  }

  await db
    .update(bookSubmissions)
    .set({ bookId })
    .where(eq(bookSubmissions.id, submission.id))

  // Sign up the submitter (dual-write for the transition: both legacy book_name and new book_id).
  await sql`
    INSERT INTO signup_books (user_id, book_name, book_id)
    VALUES (${submission.userId}, ${submission.title}, ${bookId})
    ON CONFLICT (user_id, book_name)
    DO UPDATE SET book_id = EXCLUDED.book_id
  `
  // Older signups for this book (created before the row existed in `books`) get backfilled too.
  await db
    .update(signupBooks)
    .set({ bookId })
    .where(eq(signupBooks.bookName, submission.title))

  return bookId
}
