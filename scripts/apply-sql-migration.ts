// One-off helper: applies a single .sql file to DATABASE_URL.
// Usage: tsx scripts/apply-sql-migration.ts drizzle/<file>.sql
//
// Uses Pool (TCP-like) instead of the HTTP `neon()` client, because the
// HTTP client refuses multi-statement SQL strings.
import { Pool } from '@neondatabase/serverless'
import { readFileSync } from 'node:fs'

async function main() {
  const file = process.argv[2]
  if (!file) {
    console.error('Usage: tsx scripts/apply-sql-migration.ts <path/to/file.sql>')
    process.exit(1)
  }
  const url = process.env.DATABASE_URL
  if (!url) {
    console.error('DATABASE_URL is not set')
    process.exit(1)
  }
  const pool = new Pool({ connectionString: url })
  const body = readFileSync(file, 'utf8')
  try {
    const client = await pool.connect()
    try {
      await client.query('BEGIN')
      await client.query(body)
      await client.query('COMMIT')
      console.log(`Applied: ${file}`)
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {})
      throw e
    } finally {
      client.release()
    }
  } finally {
    await pool.end()
  }
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
