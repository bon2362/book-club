export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { sql } from '@/lib/db'
import { env } from '@/env'

function isAuthorized(req: NextRequest) {
  const expected = env.CRON_SECRET
  if (!expected) return false
  const auth = req.headers.get('authorization')
  const header = req.headers.get('x-cron-secret')
  return auth === `Bearer ${expected}` || header === expected
}

export async function POST(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [{ count: unlinkedApproved }] = await sql`
    SELECT count(*)::int AS count
    FROM "book_submissions"
    WHERE "status" = 'approved'
      AND "book_id" IS NULL
  ` as Array<{ count: number }>

  if (unlinkedApproved > 0) {
    return NextResponse.json({
      error: 'Refusing cleanup: approved book_submissions rows without book_id',
      unlinkedApproved,
    }, { status: 409 })
  }

  const testRows = await sql`
    SELECT id
    FROM books
    WHERE id LIKE '__test_book_%'
       OR title LIKE 'E2E %'
  ` as Array<{ id: string }>
  const testBookIds = testRows.map(row => row.id)

  if (testBookIds.length > 0) {
    await sql`DELETE FROM signup_books WHERE book_id = ANY(${testBookIds})`
    await sql`DELETE FROM book_priorities WHERE book_id = ANY(${testBookIds})`
    await sql`DELETE FROM books WHERE id = ANY(${testBookIds})`
  }

  await sql`DROP INDEX IF EXISTS "books_canonical_key_idx"`
  await sql`DROP INDEX IF EXISTS "books_source_submission_id_idx"`
  await sql`DROP INDEX IF EXISTS "books_source_submission_id_unique"`
  await sql`ALTER TABLE "books" DROP COLUMN IF EXISTS "canonical_key"`
  await sql`ALTER TABLE "books" DROP COLUMN IF EXISTS "legacy_sheets_row_id"`
  await sql`ALTER TABLE "books" DROP COLUMN IF EXISTS "source_submission_id"`
  await sql`DROP TABLE IF EXISTS "legacy_book_mappings"`

  const removed = await sql`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        (table_name = 'books' AND column_name IN ('canonical_key', 'legacy_sheets_row_id', 'source_submission_id'))
        OR table_name = 'legacy_book_mappings'
      )
    ORDER BY table_name, column_name
  ` as Array<{ table_name: string; column_name: string | null }>

  const [{ booksCount, publishedCount, testBooksCount }] = await sql`
    SELECT
      (SELECT count(*)::int FROM books) AS "booksCount",
      (SELECT count(*)::int FROM books WHERE visibility = 'published' AND archived_at IS NULL) AS "publishedCount",
      (SELECT count(*)::int FROM books WHERE id LIKE '__test_book_%' OR title LIKE 'E2E %') AS "testBooksCount"
  ` as Array<{ booksCount: number; publishedCount: number; testBooksCount: number }>

  return NextResponse.json({
    ok: true,
    deletedTestBooks: testBookIds.length,
    removedMigrationHelpersStillPresent: removed,
    booksCount,
    publishedCount,
    testBooksCount,
  })
}
