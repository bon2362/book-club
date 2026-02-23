export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { google } from 'googleapis'

export async function GET() {
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY ?? ''
  const sheetsId = process.env.GOOGLE_SHEETS_ID ?? ''

  let sheetsError = ''
  let rowCount = 0

  try {
    const credentials = JSON.parse(key)
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    })
    const sheets = google.sheets({ version: 'v4', auth })
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetsId,
      range: 'to read!A1:K5',
    })
    rowCount = response.data.values?.length ?? 0
  } catch (e) {
    sheetsError = String(e)
  }

  return NextResponse.json({ sheetsError, rowCount })
}
