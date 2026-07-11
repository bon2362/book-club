import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { fetchNeonUsage } from '@/lib/neon-usage'

// Расход считается из внешнего Neon API в реальном времени — не кэшировать.
export const dynamic = 'force-dynamic'

export async function GET() {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  try {
    return NextResponse.json(await fetchNeonUsage())
  } catch {
    // Ключ не задан или Neon API недоступен — виджет просто не отрисуется.
    return NextResponse.json({ error: 'neon-usage-unavailable' }, { status: 502 })
  }
}
