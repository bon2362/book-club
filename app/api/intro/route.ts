export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { getIntroData } from '@/lib/intro'

export async function GET() {
  const data = await getIntroData({ onlyPublished: true })
  return NextResponse.json(data)
}
