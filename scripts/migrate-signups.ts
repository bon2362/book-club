import { google } from 'googleapis'
import { neon } from '@neondatabase/serverless'
import { drizzle } from 'drizzle-orm/neon-http'
import { signupBooks, users } from '../lib/db/schema'
import * as schema from '../lib/db/schema'
import { eq, or } from 'drizzle-orm'

function createDb() {
  return drizzle(neon(process.env.DATABASE_URL!), { schema })
}

interface MigrationSummary {
  rowsRead: number
  rowsSkippedDeleted: number
  rowsSkippedMalformed: number
  rowsSkippedOrphan: number
  booksInserted: number
  usersBackfilled: number
}

type SheetRow = string[]

function getSheets() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!)
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  return google.sheets({ version: 'v4', auth })
}

function parseBooks(raw: string | undefined): string[] | null {
  try {
    const parsed = JSON.parse(raw ?? '[]')
    if (!Array.isArray(parsed) || !parsed.every(item => typeof item === 'string')) return null
    return parsed
  } catch {
    return null
  }
}

type MigrationDb = Pick<ReturnType<typeof createDb>, 'select' | 'update' | 'insert'>

export async function migrateSignupRows(
  rows: SheetRow[],
  log: Pick<Console, 'log' | 'warn'> = console,
  database: MigrationDb = createDb()
): Promise<MigrationSummary> {
  const summary: MigrationSummary = {
    rowsRead: rows.length,
    rowsSkippedDeleted: 0,
    rowsSkippedMalformed: 0,
    rowsSkippedOrphan: 0,
    booksInserted: 0,
    usersBackfilled: 0,
  }

  for (const row of rows) {
    const [timestamp, sheetUserId, name, email, contacts, selectedBooksRaw, deleteByUser, deleteByAdmin] = row

    if (deleteByUser === 'TO DELETE' || deleteByAdmin === 'yes') {
      summary.rowsSkippedDeleted += 1
      continue
    }

    const books = parseBooks(selectedBooksRaw)
    if (!books) {
      summary.rowsSkippedMalformed += 1
      log.warn(`malformed selectedBooks for ${email || sheetUserId || '<unknown>'}`)
      continue
    }

    const normalizedEmail = (sheetUserId || '').trim().toLowerCase()
    const userRows = await database
      .select({ id: users.id, name: users.name, contacts: users.contacts })
      .from(users)
      .where(or(eq(users.email, normalizedEmail), eq(users.contactEmail, normalizedEmail)))
      .limit(1)

    const user = userRows[0]
    if (!user) {
      summary.rowsSkippedOrphan += 1
      log.warn(`orphan signup skipped: ${normalizedEmail || '<empty email>'}`)
      continue
    }

    if (user.name === null || user.contacts === null) {
      await database.update(users).set({
        ...(user.name === null ? { name: name || null } : {}),
        ...(user.contacts === null ? { contacts: contacts || null } : {}),
      }).where(eq(users.id, user.id))
      summary.usersBackfilled += 1
    }

    const signedAt = timestamp ? new Date(timestamp) : new Date()
    const validSignedAt = Number.isNaN(signedAt.getTime()) ? new Date() : signedAt
    for (const bookName of books) {
      await database.insert(signupBooks)
        .values({ userId: user.id, bookName, signedAt: validSignedAt })
        .onConflictDoNothing()
      summary.booksInserted += 1
    }
  }

  log.log(`rows=${summary.rowsRead}`)
  log.log(`booksInserted=${summary.booksInserted}`)
  log.log(`skippedDeleted=${summary.rowsSkippedDeleted}`)
  log.log(`skippedMalformed=${summary.rowsSkippedMalformed}`)
  log.log(`skippedOrphan=${summary.rowsSkippedOrphan}`)
  log.log(`usersBackfilled=${summary.usersBackfilled}`)

  return summary
}

export async function main() {
  const sheets = getSheets()
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEETS_ID!,
    range: 'signups!A:H',
  })
  const rows = (response.data.values ?? []).slice(1)
  await migrateSignupRows(rows)
}

if (require.main === module) {
  main().catch((error) => {
    console.error(error)
    process.exit(1)
  })
}
