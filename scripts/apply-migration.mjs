#!/usr/bin/env node
/**
 * Applies a specific migration SQL file directly via Neon serverless driver.
 * Usage: node scripts/apply-migration.mjs <path-to-sql>
 */
import { readFileSync } from 'fs'
import { neonConfig, Pool } from '@neondatabase/serverless'
import ws from 'ws'

neonConfig.webSocketConstructor = ws

const sqlFile = process.argv[2]
if (!sqlFile) {
  console.error('Usage: node scripts/apply-migration.mjs <path-to-sql>')
  process.exit(1)
}

const rawSql = readFileSync(sqlFile, 'utf-8')
// Split on drizzle-kit breakpoints; filter empty chunks
const statements = rawSql
  .split('--> statement-breakpoint')
  .map(s => s.trim())
  .filter(Boolean)

const pool = new Pool({ connectionString: process.env.DATABASE_URL })

try {
  for (const stmt of statements) {
    console.log('Executing:', stmt.slice(0, 80).replace(/\s+/g, ' '), '...')
    await pool.query(stmt)
  }
  console.log(`\n✅ Migration applied: ${sqlFile}`)
} catch (err) {
  console.error('\n❌ Migration failed:', err.message)
  process.exit(1)
} finally {
  await pool.end()
}
