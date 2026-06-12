export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createTelegramAccountLinkState } from '@/lib/account-linking-state'

export async function GET(req: NextRequest) {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { origin } = new URL(req.url)
  const state = createTelegramAccountLinkState(userId)
  const authUrl = new URL('/api/account/identities/telegram/callback', origin)
  authUrl.searchParams.set('state', state)

  return NextResponse.json({ state, authUrl: authUrl.toString() })
}
