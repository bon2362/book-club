/* eslint-disable no-console */
/**
 * Stage 0 audit for the books catalog refactor.
 *
 * DEPRECATED one-shot script. It documents the pre-0021 migration input and
 * expects legacy tables/columns that no longer exist after the catalog moved
 * to books/book_id. Do not run this against the current production schema.
 *
 * Reads production-like data from:
 *   - Google Sheets (current canonical catalog)
 *   - book_submissions, book_statuses, book_new_flags
 *   - signup_books.book_name, book_priorities.book_name
 *
 * Produces:
 *   - data/books-catalog-snapshot.json   (machine-readable, used to seed the migration)
 *   - docs/planning-artifacts/books-catalog-migration-audit.md  (human review)
 *
 * Run:
 *   npx ts-node --transpile-only -P tsconfig.scripts.json scripts/books-catalog-audit.ts
 */

import fsLoad from 'node:fs'
import pathLoad from 'node:path'

// Minimal .env.local loader (avoids adding dotenv dep just for this script).
function loadEnvLocal() {
  const p = pathLoad.resolve(__dirname, '..', '.env.local')
  if (!fsLoad.existsSync(p)) return
  const content = fsLoad.readFileSync(p, 'utf8')
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    if (!process.env[key]) process.env[key] = value
  }
}
loadEnvLocal()

import { google } from 'googleapis'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { writeFileSync } from 'node:fs'
import * as schema from '../lib/db/schema'
import { parseBookRow, filterBooks, type Book as SheetsBook } from '../lib/sheets'

interface BookSeed {
  uuid: string
  source: 'sheets_import' | 'submission'
  legacySheetsRowId: string | null
  sourceSubmissionId: string | null
  canonicalKey: string
  title: string
  author: string
  tags: string[]
  type: 'book' | 'article'
  size: string
  pages: number | null
  publishedDate: string
  textUrl: string
  description: string
  coverUrl: string | null
  whyRead: string | null
  recommendationLink: string | null
  readingStatus: 'reading' | 'read' | null
  isNew: boolean
  visibility: 'published' | 'hidden'
  sortOrder: number
  publishedAtIso: string
}

interface LegacyMapping {
  legacySource: 'sheets' | 'submission' | 'book_name'
  legacyId: string
  legacyTitle: string
  legacyAuthor: string | null
  bookUuid: string | null
  confidence: 'exact' | 'normalized' | 'manual' | 'unmatched'
  resolution: string
}

interface Snapshot {
  generatedAt: string
  counts: Record<string, number>
  books: BookSeed[]
  legacyMappings: LegacyMapping[]
  unmatched: LegacyMapping[]
  warnings: string[]
}

function normalizeKey(title: string, author: string): string {
  const norm = (s: string) =>
    s.toLowerCase().replace(/[ёе]/g, 'е').replace(/[^a-zа-я0-9]+/gi, ' ').trim()
  return `${norm(title)}|${norm(author)}`
}

function deterministicUuid(seed: string): string {
  // Stable UUID v4-shape from a string seed (used so reruns/idempotent backfill produce the same id).
  // crypto.randomUUID is not deterministic; we hash the seed and format as UUID.
  const hash = crypto.createHash('sha256').update(`books|${seed}`).digest('hex')
  return (
    hash.slice(0, 8) + '-' +
    hash.slice(8, 12) + '-' +
    '4' + hash.slice(13, 16) + '-' +
    '8' + hash.slice(17, 20) + '-' +
    hash.slice(20, 32)
  )
}

function normalizeType(raw: string): 'book' | 'article' | null {
  const v = raw.trim().toLowerCase()
  if (v === 'book') return 'book'
  if (v === 'article') return 'article'
  return null
}

async function fetchSheets(): Promise<SheetsBook[]> {
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  const sheetId = process.env.GOOGLE_SHEETS_ID
  if (!key || !sheetId) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY / GOOGLE_SHEETS_ID not configured')
  const auth = new google.auth.GoogleAuth({
    credentials: JSON.parse(key),
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  })
  const sheets = google.sheets({ version: 'v4', auth })
  const r = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId.trim(), range: 'to read!A:N' })
  const rows = (r.data.values ?? []).slice(1)
  return filterBooks(rows.map((row, i) => parseBookRow(row, i)).filter(Boolean) as SheetsBook[])
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set')
  const db = drizzle(neon(process.env.DATABASE_URL), { schema })

  console.log('Fetching Sheets...')
  const sheetsBooks = await fetchSheets()
  console.log(`  ${sheetsBooks.length} catalog rows`)

  console.log('Fetching DB tables...')
  // book_statuses and book_new_flags were dropped in 0022 (after merge into books). Use raw SQL
  // here because the typed schema no longer defines those tables — the audit script is kept
  // around as a historical artifact of the snapshot used to seed 0021.
  const { sql: rawSql } = await import('../lib/db')
  const [submissions, statuses, newFlags, signups, priorities] = await Promise.all([
    db.select().from(schema.bookSubmissions),
    rawSql`SELECT book_id, status FROM book_statuses` as unknown as Promise<Array<{ bookId: string; status: string }>>,
    rawSql`SELECT book_id, is_new FROM book_new_flags` as unknown as Promise<Array<{ bookId: string; isNew: boolean }>>,
    db.select().from(schema.signupBooks),
    db.select().from(schema.bookPriorities),
  ]).catch(async () => {
    // Tables already dropped — return empty arrays so re-running the audit post-cleanup
    // doesn't fail.
    return [
      await db.select().from(schema.bookSubmissions),
      [] as Array<{ bookId: string; status: string }>,
      [] as Array<{ bookId: string; isNew: boolean }>,
      await db.select().from(schema.signupBooks),
      await db.select().from(schema.bookPriorities),
    ] as const
  })
  console.log(`  submissions=${submissions.length} statuses=${statuses.length} newFlags=${newFlags.length} signups=${signups.length} priorities=${priorities.length}`)

  const approvedSubs = submissions.filter(s => s.status === 'approved')

  const books: BookSeed[] = []
  const byKey = new Map<string, BookSeed>()
  const warnings: string[] = []
  const legacy: LegacyMapping[] = []

  // 1. Approved submissions come first in the catalog (preserve current "newest at top" order).
  //    Match current fetchBooksWithCovers logic: sort by createdAt desc.
  const approvedSorted = [...approvedSubs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  )
  let order = 0
  for (const s of approvedSorted) {
    const key = normalizeKey(s.title, s.author)
    const uuid = deterministicUuid(`submission|${s.id}`)
    const statusRow = statuses.find(st => st.bookId === s.id)
    const flagRow = newFlags.find(f => f.bookId === s.id)
    const seed: BookSeed = {
      uuid,
      source: 'submission',
      legacySheetsRowId: null,
      sourceSubmissionId: s.id,
      canonicalKey: key,
      title: s.title,
      author: s.author,
      tags: s.topic ? [s.topic] : [],
      type: 'book',
      size: '',
      pages: s.pages,
      publishedDate: s.publishedDate ?? '',
      textUrl: s.textUrl ?? '',
      description: s.description ?? '',
      coverUrl: s.coverUrl ?? null,
      whyRead: s.whyRead || null,
      recommendationLink: null,
      readingStatus: (statusRow?.status as 'reading' | 'read' | undefined) ?? null,
      isNew: flagRow?.isNew ?? (new Date(s.createdAt).getTime() > Date.now() - 30 * 86400000),
      visibility: 'published',
      sortOrder: order++,
      publishedAtIso: new Date(s.createdAt).toISOString(),
    }
    books.push(seed)
    byKey.set(key, seed)
    legacy.push({
      legacySource: 'submission',
      legacyId: s.id,
      legacyTitle: s.title,
      legacyAuthor: s.author,
      bookUuid: uuid,
      confidence: 'exact',
      resolution: 'approved submission -> books row by submission id',
    })
  }

  // 2. Sheets books — preserve the current `.reverse()` order from fetchBooksWithCovers.
  const sheetsReversed = [...sheetsBooks].reverse()
  for (const b of sheetsReversed) {
    const normType = normalizeType(b.type)
    if (!normType) {
      warnings.push(`Sheets row id=${b.id} title="${b.name}" has unknown type "${b.type}" — skipped from books seed`)
      continue
    }
    const key = normalizeKey(b.name, b.author)
    if (byKey.has(key)) {
      const existing = byKey.get(key)!
      warnings.push(`Duplicate by normalized title+author: Sheets row id=${b.id} "${b.name}" overlaps with ${existing.source} ${existing.sourceSubmissionId ?? existing.legacySheetsRowId}`)
    }
    const uuid = deterministicUuid(`sheets|${b.id}`)
    const statusRow = statuses.find(st => st.bookId === b.id)
    const flagRow = newFlags.find(f => f.bookId === b.id)
    const seed: BookSeed = {
      uuid,
      source: 'sheets_import',
      legacySheetsRowId: b.id,
      sourceSubmissionId: null,
      canonicalKey: key,
      title: b.name,
      author: b.author,
      tags: b.tags,
      type: normType,
      size: b.size,
      pages: b.pages ? Number.parseInt(b.pages, 10) || null : null,
      publishedDate: b.date,
      textUrl: b.link,
      description: b.description,
      coverUrl: b.coverUrl,
      whyRead: b.whyForClub,
      recommendationLink: b.recommendationLink,
      readingStatus: (statusRow?.status as 'reading' | 'read' | undefined) ?? null,
      isNew: flagRow?.isNew ?? false,
      visibility: 'published',
      sortOrder: order++,
      publishedAtIso: new Date().toISOString(),
    }
    books.push(seed)
    byKey.set(key, seed)
    legacy.push({
      legacySource: 'sheets',
      legacyId: b.id,
      legacyTitle: b.name,
      legacyAuthor: b.author,
      bookUuid: uuid,
      confidence: 'exact',
      resolution: 'Sheets row -> books row by row id',
    })
  }

  // 3. Title-based legacy from signup_books / book_priorities.
  const titleToBook = new Map<string, BookSeed>()
  for (const b of books) {
    const k = normalizeKey(b.title, '')
    if (!titleToBook.has(k)) titleToBook.set(k, b)
  }
  const unmatched: LegacyMapping[] = []
  // signup_books/book_priorities had a `book_name` column at the time of this one-shot audit;
  // the column was removed in cleanup migration 0022. Cast loosely so the script still type-checks.
  const distinctSignupNames = Array.from(new Set(signups.map(s => (s as unknown as { bookName: string }).bookName).filter(Boolean)))
  const distinctPriorityNames = Array.from(new Set(priorities.map(p => (p as unknown as { bookName: string }).bookName).filter(Boolean)))
  const namesToMap = Array.from(new Set([...distinctSignupNames, ...distinctPriorityNames]))
  for (const name of namesToMap) {
    const k = normalizeKey(name, '')
    const matched = titleToBook.get(k) ?? null
    const entry: LegacyMapping = {
      legacySource: 'book_name',
      legacyId: name,
      legacyTitle: name,
      legacyAuthor: null,
      bookUuid: matched?.uuid ?? null,
      confidence: matched ? 'normalized' : 'unmatched',
      resolution: matched ? 'matched by normalized title' : 'no book found by normalized title',
    }
    legacy.push(entry)
    if (!matched) unmatched.push(entry)
  }

  // 4. Statuses / newFlags rows referencing ids that didn't match anything (Sheets row deleted? submission rejected?).
  for (const st of statuses) {
    const matchedBook = books.find(b => b.legacySheetsRowId === st.bookId || b.sourceSubmissionId === st.bookId)
    if (!matchedBook) {
      legacy.push({
        legacySource: 'sheets',
        legacyId: st.bookId,
        legacyTitle: '(unknown — orphan in book_statuses)',
        legacyAuthor: null,
        bookUuid: null,
        confidence: 'unmatched',
        resolution: `book_statuses.book_id=${st.bookId} (status=${st.status}) has no matching book`,
      })
      unmatched.push(legacy[legacy.length - 1])
    }
  }
  for (const f of newFlags) {
    const matchedBook = books.find(b => b.legacySheetsRowId === f.bookId || b.sourceSubmissionId === f.bookId)
    if (!matchedBook) {
      legacy.push({
        legacySource: 'sheets',
        legacyId: f.bookId,
        legacyTitle: '(unknown — orphan in book_new_flags)',
        legacyAuthor: null,
        bookUuid: null,
        confidence: 'unmatched',
        resolution: `book_new_flags.book_id=${f.bookId} (is_new=${f.isNew}) has no matching book`,
      })
      unmatched.push(legacy[legacy.length - 1])
    }
  }

  const snapshot: Snapshot = {
    generatedAt: new Date().toISOString(),
    counts: {
      sheetsBooks: sheetsBooks.length,
      submissionsTotal: submissions.length,
      submissionsApproved: approvedSubs.length,
      bookStatuses: statuses.length,
      bookNewFlags: newFlags.length,
      signups: signups.length,
      distinctSignupNames: distinctSignupNames.length,
      priorities: priorities.length,
      distinctPriorityNames: distinctPriorityNames.length,
      booksSeed: books.length,
      unmatched: unmatched.length,
      warnings: warnings.length,
    },
    books,
    legacyMappings: legacy,
    unmatched,
    warnings,
  }

  const root = path.resolve(__dirname, '..')
  fs.mkdirSync(path.join(root, 'data'), { recursive: true })
  writeFileSync(path.join(root, 'data', 'books-catalog-snapshot.json'), JSON.stringify(snapshot, null, 2))

  const md = renderReport(snapshot)
  writeFileSync(path.join(root, 'docs', 'planning-artifacts', 'books-catalog-migration-audit.md'), md)

  console.log('\nDone:')
  for (const [k, v] of Object.entries(snapshot.counts)) console.log(`  ${k} = ${v}`)
  if (unmatched.length > 0) {
    console.warn(`\n!! ${unmatched.length} unmatched legacy rows — see report`)
  }
}

function renderReport(s: Snapshot): string {
  const head = `# Books catalog migration — Stage 0 audit

Generated: ${s.generatedAt}

## Counts

${Object.entries(s.counts).map(([k, v]) => `- ${k}: ${v}`).join('\n')}

## Warnings (${s.warnings.length})

${s.warnings.length === 0 ? '_none_' : s.warnings.map(w => `- ${w}`).join('\n')}

## Unmatched legacy rows (${s.unmatched.length})

${s.unmatched.length === 0 ? '_none_' : '| source | legacy_id | legacy_title | reason |\n|---|---|---|---|\n' + s.unmatched.map(u => `| ${u.legacySource} | \`${u.legacyId}\` | ${u.legacyTitle.replace(/\|/g, '\\|')} | ${u.resolution} |`).join('\n')}

## Sample books (first 5)

\`\`\`json
${JSON.stringify(s.books.slice(0, 5), null, 2)}
\`\`\`

## Spot checks from plan

- Sheets row id=2 → \`${s.books.find(b => b.legacySheetsRowId === '2')?.title ?? '(none)'}\`
- Sheets row id=38 → \`${s.books.find(b => b.legacySheetsRowId === '38')?.title ?? '(none)'}\`

## Mapping summary

| confidence | count |
|---|---|
${['exact', 'normalized', 'manual', 'unmatched'].map(c => `| ${c} | ${s.legacyMappings.filter(m => m.confidence === c).length} |`).join('\n')}

`
  return head
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
