/* eslint-disable no-console */
/**
 * One-shot cleanup of E2E test fixtures that leaked into the production DB
 * because earlier revisions of lib/books.ts auto-seeded them on every read.
 *
 *   npx ts-node --transpile-only -P tsconfig.scripts.json scripts/cleanup-test-books.ts
 */
import fs from 'node:fs'
import path from 'node:path'
import { Client, neonConfig } from '@neondatabase/serverless'
import ws from 'ws'

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

const TEST_IDS = ['__test_book_1__', '__test_book_2__', '__test_book_3__']

async function main() {
  neonConfig.webSocketConstructor = ws
  const client = new Client(process.env.DATABASE_URL!)
  await client.connect()
  try {
    const before = await client.query(`SELECT id, title FROM books WHERE id = ANY($1::text[])`, [TEST_IDS])
    console.log('Test books currently in DB:', before.rows)
    const beforeSignups = await client.query(`SELECT user_id, book_id FROM signup_books WHERE book_id = ANY($1::text[])`, [TEST_IDS])
    console.log('Signups against test books:', beforeSignups.rows)

    await client.query('BEGIN')
    await client.query(`DELETE FROM signup_books WHERE book_id = ANY($1::text[])`, [TEST_IDS])
    await client.query(`DELETE FROM book_priorities WHERE book_id = ANY($1::text[])`, [TEST_IDS])
    await client.query(`DELETE FROM books WHERE id = ANY($1::text[])`, [TEST_IDS])
    await client.query('COMMIT')

    const after = await client.query(`SELECT id FROM books WHERE id = ANY($1::text[])`, [TEST_IDS])
    console.log('Remaining test books after cleanup:', after.rows.length)
  } catch (e) {
    await client.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    await client.end()
  }
}

main().catch(e => { console.error(e); process.exit(1) })
