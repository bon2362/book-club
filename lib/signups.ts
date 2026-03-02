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

export async function getAllSignups(): Promise<UserSignup[]> {
  const sheets = getSheets()
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: process.env.GOOGLE_SHEETS_ID!,
    range: SIGNUPS_RANGE,
  })
  const rows = (response.data.values ?? []).slice(1) // skip header
  return rows.map(parseSignupRow)
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

  if (updated.length === 0) {
    await markSignupDeleted(userId)
    return
  }

  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `signups!F${rowIndex + 1}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[JSON.stringify(updated)]] },
  })
}

export async function upsertSignup(data: Omit<UserSignup, 'timestamp'>): Promise<void> {
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
  } else {
    // Preserve original timestamp
    newRow[0] = rows[rowIndex][0]
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `signups!A${rowIndex + 1}:F${rowIndex + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values: [newRow] },
    })
  }
}
