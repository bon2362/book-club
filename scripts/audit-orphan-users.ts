/* eslint-disable no-console */
/**
 * Audit and backfill users without user_identities rows.
 *
 *   npx ts-node --transpile-only -P tsconfig.scripts.json scripts/audit-orphan-users.ts
 *   npx ts-node --transpile-only -P tsconfig.scripts.json scripts/audit-orphan-users.ts --apply
 *
 * Without --apply only reports orphan users. With --apply creates an email
 * identity for orphan users that have contact_email; users without an email
 * are only reported because the provider cannot be safely inferred.
 */
import crypto from 'node:crypto'
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

const APPLY = process.argv.includes('--apply')

async function main() {
  neonConfig.webSocketConstructor = ws
  const client = new Client(process.env.DATABASE_URL!)
  await client.connect()
  try {
    const orphans = await client.query<{
      id: string
      contact_email: string | null
      created_at: Date
    }>(`
      select u.id, u.contact_email, u.created_at
      from "user" u
      where not exists (
        select 1 from user_identities ui where ui.user_id = u.id
      )
      order by u.created_at asc
    `)

    if (orphans.rows.length === 0) {
      console.log('No orphan users found. Invariant holds.')
      return
    }

    console.log(`Found ${orphans.rows.length} orphan user(s):`)
    for (const row of orphans.rows) {
      console.log(`  ${row.id}  email=${row.contact_email ?? '<none>'}  created_at=${row.created_at.toISOString()}`)
    }

    const fixable = orphans.rows.filter(r => r.contact_email && r.contact_email.trim().length > 0)
    const unfixable = orphans.rows.filter(r => !r.contact_email || r.contact_email.trim().length === 0)

    if (unfixable.length > 0) {
      console.log(`\n${unfixable.length} user(s) have no contact_email — provider cannot be inferred, skipping backfill:`)
      for (const row of unfixable) console.log(`  ${row.id}`)
    }

    if (!APPLY) {
      console.log(`\nDry run. Re-run with --apply to backfill ${fixable.length} email identity row(s).`)
      return
    }

    if (fixable.length === 0) {
      console.log('\nNothing to backfill.')
      return
    }

    console.log(`\nBackfilling email identity for ${fixable.length} user(s)...`)
    await client.query('BEGIN')
    try {
      for (const row of fixable) {
        const email = row.contact_email!.trim().toLowerCase()
        await client.query(
          `insert into user_identities
             (id, user_id, provider, provider_account_id, email, metadata)
           values ($1, $2, 'email', $3, $3, $4)
           on conflict (provider, provider_account_id) do nothing`,
          [crypto.randomUUID(), row.id, email, JSON.stringify({ source: 'manual-backfill' })]
        )
        console.log(`  ok  ${row.id}  email=${email}`)
      }
      await client.query('COMMIT')
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {})
      throw e
    }

    const after = await client.query<{ count: string }>(`
      select count(*)::text as count
      from "user" u
      where not exists (
        select 1 from user_identities ui where ui.user_id = u.id
      )
    `)
    console.log(`\nOrphan users remaining: ${after.rows[0].count}`)
  } finally {
    await client.end()
  }
}

main().catch(e => { console.error(e); process.exit(1) })
