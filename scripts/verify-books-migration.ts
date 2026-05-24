/* eslint-disable no-console */
import fs from 'node:fs'
import path from 'node:path'
import { neon } from '@neondatabase/serverless'

function loadEnv() {
  const p = path.resolve(__dirname, '..', '.env.local')
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim(); if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('='); if (eq < 0) continue
    const k = t.slice(0, eq).trim(); let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!process.env[k]) process.env[k] = v
  }
}
loadEnv()

async function main() {
  const sql = neon(process.env.DATABASE_URL!)
  const counts = await sql`SELECT
    (SELECT count(*) FROM books) AS books,
    (SELECT count(*) FROM books WHERE visibility='published') AS published,
    (SELECT count(*) FROM books WHERE visibility='hidden') AS hidden,
    (SELECT count(*) FROM signup_books) AS signups_total,
    (SELECT count(*) FROM signup_books WHERE book_id IS NOT NULL) AS signups_with_book_id,
    (SELECT count(*) FROM book_priorities) AS priorities_total,
    (SELECT count(*) FROM book_priorities WHERE book_id IS NOT NULL) AS priorities_with_book_id,
    (SELECT count(*) FROM book_submissions WHERE book_id IS NOT NULL) AS submissions_with_book_id,
    (SELECT count(*) FROM book_submissions WHERE status='approved' AND book_id IS NULL) AS approved_submissions_without_book_id` as Array<Record<string, string>>
  console.log(counts[0])

  const removed = await sql`
    SELECT table_name, column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND (
        (table_name = 'books' AND column_name IN ('canonical_key', 'legacy_sheets_row_id', 'source_submission_id'))
        OR table_name = 'legacy_book_mappings'
      )
    ORDER BY table_name, column_name
  ` as Array<Record<string, string>>
  console.log('Removed migration helpers still present:', removed)

  const unmatched = await sql`SELECT count(*) AS c FROM signup_books WHERE book_id IS NULL` as Array<Record<string, string>>
  console.log('Signup rows without book_id:', unmatched[0].c)
}
main().catch(e => { console.error(e); process.exit(1) })
