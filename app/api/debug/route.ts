export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'
import { google } from 'googleapis'

export async function GET() {
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY ?? ''
  const sheetsId = process.env.GOOGLE_SHEETS_ID ?? ''

  let sheetsError = ''
  let tabsResult: string[] = []

  try {
    const credentials = JSON.parse(key)
    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
    })
    const sheets = google.sheets({ version: 'v4', auth })
    // Try to list tabs first (spreadsheets.get)
    const meta = await sheets.spreadsheets.get({ spreadsheetId: sheetsId })
    tabsResult = meta.data.sheets?.map(s => s.properties?.title ?? '') ?? []
  } catch (e: unknown) {
    if (e && typeof e === 'object' && 'response' in e) {
      const err = e as { response?: { status?: number; data?: unknown }; message?: string }
      sheetsError = `${err.message} | status=${err.response?.status} | data=${JSON.stringify(err.response?.data)}`
    } else {
      sheetsError = String(e)
    }
  }

  return NextResponse.json({ sheetsError, tabsResult, sheetsId: sheetsId.slice(0, 20) })
}
