export const dynamic = 'force-dynamic'
import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    sheetsId: process.env.GOOGLE_SHEETS_ID,
    keyLength: (process.env.GOOGLE_SERVICE_ACCOUNT_KEY ?? '').length,
  })
}
