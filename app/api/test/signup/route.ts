// Test-only endpoint: writes/removes a signup row directly to Google Sheets.
// Only works when NEXTAUTH_TEST_MODE=true — never enabled in production.
// Used for E2E tests that need the admin panel to show test users.

import { NextRequest, NextResponse } from 'next/server'
import { google } from 'googleapis'

function notAllowed() {
  return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
}

function getSheets() {
  const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_KEY!)
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  })
  return google.sheets({ version: 'v4', auth })
}

const RANGE = 'signups!A:H'

export async function POST(req: NextRequest) {
  if (process.env.NEXTAUTH_TEST_MODE !== 'true') return notAllowed()

  const { userId, name, email, contacts, selectedBooks } = await req.json() as {
    userId: string; name: string; email: string; contacts: string; selectedBooks: string[]
  }

  const sheets = getSheets()
  const sheetId = process.env.GOOGLE_SHEETS_ID!

  const response = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: RANGE })
  const rows = response.data.values ?? []
  const rowIndex = rows.findIndex(r => r[1] === userId)

  // Full row including clearing G (DeleteByUser) and H (DeleteByAdmin)
  const row = [new Date().toISOString(), userId, name, email, contacts, JSON.stringify(selectedBooks), '', '']

  if (rowIndex === -1) {
    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: RANGE,
      valueInputOption: 'RAW',
      requestBody: { values: [row] },
    })
  } else {
    await sheets.spreadsheets.values.update({
      spreadsheetId: sheetId,
      range: `signups!A${rowIndex + 1}:H${rowIndex + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values: [row] },
    })
  }

  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  if (process.env.NEXTAUTH_TEST_MODE !== 'true') return notAllowed()

  const { userId } = await req.json() as { userId: string }

  const sheets = getSheets()
  const sheetId = process.env.GOOGLE_SHEETS_ID!

  const response = await sheets.spreadsheets.values.get({ spreadsheetId: sheetId, range: RANGE })
  const rows = response.data.values ?? []
  const rowIndex = rows.findIndex(r => r[1] === userId)

  if (rowIndex === -1) return NextResponse.json({ ok: true, notFound: true })

  // Mark as TO DELETE so getAllSignups filters it out on next read
  await sheets.spreadsheets.values.update({
    spreadsheetId: sheetId,
    range: `signups!G${rowIndex + 1}:H${rowIndex + 1}`,
    valueInputOption: 'RAW',
    requestBody: { values: [['TO DELETE', 'yes']] },
  })

  return NextResponse.json({ ok: true })
}
