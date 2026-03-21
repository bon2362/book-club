import { google } from 'googleapis'

export interface UserSignup {
  timestamp: string
  userId: string
  name: string
  email: string
  contacts: string
  selectedBooks: string[]
}

export function parseSignupRow(row: string[]): UserSignup {
  return {
    timestamp: row[0] ?? '',
    userId: row[1] ?? '',
    name: row[2] ?? '',
    email: row[3] ?? '',
    contacts: row[4] ?? '',
    selectedBooks: JSON.parse(row[5] ?? '[]'),
  }
}

export function buildSignupRow(data: Omit<UserSignup, 'timestamp'>): string[] {
  return [
    new Date().toISOString(),
    data.userId,
    data.name,
    data.email,
    data.contacts,
    JSON.stringify(data.selectedBooks),
  ]
}

function getSheets() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!)
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  return google.sheets({ version: 'v4', auth })
}

const SIGNUPS_RANGE = 'signups!A:F'
const SIGNUPS_RANGE_WITH_FLAGS = 'signups!A:H'

export async function getAllSignups(): Promise<UserSignup[]> {
  const sheets = getSheets()
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEETS_ID!,
    range: SIGNUPS_RANGE_WITH_FLAGS,
  })
  const rows = (response.data.values ?? []).slice(1) // skip header
  return rows.filter(r => r[6] !== 'TO DELETE').map(parseSignupRow)
}

export async function markSignupDeleted(userId: string): Promise<void> {
  const sheets = getSheets()
  const sheetId = process.env.GOOGLE_SHEETS_ID!

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: SIGNUPS_RANGE,
  })
  const rows = response.data.values ?? []
  const rowIndex = rows.findIndex(r => r[1] === userId)
  if (rowIndex === -1) return

  const sheetRow = rowIndex + 1 // 1-based, rowIndex 0 = header → row 1
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `signups!G${sheetRow}`,
    valueInputOption: 'RAW',
    requestBody: { values: [['TO DELETE']] },
  })
}

export async function markSignupDeletedByAdmin(userId: string): Promise<void> {
  const sheets = getSheets()
  const sheetId = process.env.GOOGLE_SHEETS_ID!

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: SIGNUPS_RANGE,
  })
  const rows = response.data.values ?? []
  const rowIndex = rows.findIndex(r => r[1] === userId)
  if (rowIndex === -1) return

  const sheetRow = rowIndex + 1
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `signups!G${sheetRow}:H${sheetRow}`,
    valueInputOption: 'RAW',
    requestBody: { values: [['TO DELETE', 'yes']] },
  })
}

export async function removeBookFromSignup(userId: string, bookName: string): Promise<void> {
  const sheets = getSheets()
  const sheetId = process.env.GOOGLE_SHEETS_ID!

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: SIGNUPS_RANGE,
  })
  const rows = response.data.values ?? []
  const rowIndex = rows.findIndex(r => r[1] === userId)
  if (rowIndex === -1) return

  const row = rows[rowIndex]
  const books: string[] = JSON.parse(row[5] ?? '[]')
  const updated = books.filter(b => b !== bookName)

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `signups!F${rowIndex + 1}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[JSON.stringify(updated)]] },
  })
}

export interface UpsertResult {
  isNew: boolean
  addedBooks: string[]
}

export async function upsertSignup(data: Omit<UserSignup, 'timestamp'>): Promise<UpsertResult> {
  if (process.env.NEXTAUTH_TEST_MODE === 'true') {
    return { isNew: true, addedBooks: data.selectedBooks }
  }

  const sheets = getSheets()
  const sheetId = process.env.GOOGLE_SHEETS_ID!

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: sheetId,
    range: SIGNUPS_RANGE,
  })
  const rows = response.data.values ?? []
  // rows[0] is header, data rows start at index 1 → sheet row = rowIndex + 1
  const rowIndex = rows.findIndex(r => r[1] === data.userId)

  const newRow = buildSignupRow(data)

  if (rowIndex === -1) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: SIGNUPS_RANGE,
      valueInputOption: 'RAW',
      requestBody: { values: [newRow] },
    })
    return { isNew: true, addedBooks: data.selectedBooks }
  } else {
    const prevBooks: string[] = JSON.parse(rows[rowIndex][5] ?? '[]')
    const addedBooks = data.selectedBooks.filter(b => !prevBooks.includes(b))
    // Preserve original timestamp
    newRow[0] = rows[rowIndex][0]
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `signups!A${rowIndex + 1}:F${rowIndex + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values: [newRow] },
    })
    return { isNew: false, addedBooks }
  }
}
