export const dynamic = 'force-dynamic'

import { timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { clampSince, getWidgetUpdates } from '@/lib/widget-updates'

// Сводка новых событий для десктопного виджета владельца (Übersicht).
// Сессии у виджета нет, поэтому доступ по Bearer WIDGET_TOKEN.

function isAuthorized(header: string | null, token: string) {
  const expected = Buffer.from(`Bearer ${token}`)
  const actual = Buffer.from(header ?? '')
  return actual.length === expected.length && timingSafeEqual(actual, expected)
}

export async function GET(req: Request) {
  const token = process.env.WIDGET_TOKEN
  if (!token) {
    return NextResponse.json({ error: 'Misconfigured' }, { status: 401 })
  }
  if (!isAuthorized(req.headers.get('Authorization'), token)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const now = new Date()
  const since = clampSince(new URL(req.url).searchParams.get('since'), now)
  const data = await getWidgetUpdates(since, now)
  return NextResponse.json(data, { headers: { 'Cache-Control': 'no-store' } })
}
