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
    (SELECT count(*) FROM legacy_book_mappings) AS mappings,
    (SELECT count(*) FROM signup_books) AS signups_total,
    (SELECT count(*) FROM signup_books WHERE book_id IS NOT NULL) AS signups_with_book_id,
    (SELECT count(*) FROM book_priorities) AS priorities_total,
    (SELECT count(*) FROM book_priorities WHERE book_id IS NOT NULL) AS priorities_with_book_id,
    (SELECT count(*) FROM book_submissions WHERE book_id IS NOT NULL) AS submissions_with_book_id` as Array<Record<string, string>>
  console.log(counts[0])

  const sample = await sql`SELECT title, source, legacy_sheets_row_id FROM books WHERE legacy_sheets_row_id IN ('2','38') ORDER BY legacy_sheets_row_id` as Array<Record<string, string>>
  console.log('Spot check rows 2 & 38:', sample)

  const unmatched = await sql`SELECT count(*) AS c FROM signup_books WHERE book_id IS NULL` as Array<Record<string, string>>
  console.log('Signup rows without book_id:', unmatched[0].c)
}
main().catch(e => { console.error(e); process.exit(1) })
