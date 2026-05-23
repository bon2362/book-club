/* eslint-disable no-console */
/**
 * Apply a single SQL migration file via the @neondatabase/serverless pg-compatible Client.
 *   npx ts-node --transpile-only -P tsconfig.scripts.json scripts/apply-migration.ts drizzle/0021_books_catalog.sql
 */
import fs from 'node:fs'
import path from 'node:path'
import { Client, neonConfig } from '@neondatabase/serverless'
import ws from 'ws'

function loadEnv() {
  const p = path.resolve(__dirname, '..', '.env.local')
  if (!fs.existsSync(p)) return
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq < 0) continue
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (!process.env[k]) process.env[k] = v
  }
}
loadEnv()

async function main() {
  const file = process.argv[2]
  if (!file) {
    console.error('Usage: apply-migration.ts <sql-file>')
    process.exit(1)
  }
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set')

  // The serverless pg Client needs WebSockets in Node.
  neonConfig.webSocketConstructor = ws

  const sqlText = fs.readFileSync(path.resolve(file), 'utf8')
  console.log(`Applying ${file} (${sqlText.length} bytes)...`)

  const client = new Client(process.env.DATABASE_URL)
  await client.connect()
  try {
    await client.query('BEGIN')
    await client.query(sqlText)
    await client.query('COMMIT')
    console.log('Done.')
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    await client.end()
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
