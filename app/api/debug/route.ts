export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'

export async function GET() {
  const key = process.env.GOOGLE_SERVICE_ACCOUNT_KEY ?? ''
  let parsed: unknown = null
  let parseError = ''
  try {
    parsed = JSON.parse(key)
  } catch (e) {
    parseError = String(e)
  }

  return NextResponse.json({
    keyLength: key.length,
    keyStart: key.slice(0, 30),
    sheetsId: process.env.GOOGLE_SHEETS_ID?.slice(0, 10),
    parseError,
    clientEmail: (parsed as Record<string, string>)?.client_email ?? null,
  })
}
