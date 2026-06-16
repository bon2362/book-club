export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { createTelegramPreauthToken } from '@/lib/telegram-auth'

// Чеканит одноразовый link-nonce, привязанный к текущему пользователю.
// Профиль открывает t.me/<bot>?start=link_<nonce>; вебхук по этому nonce
// привяжет Telegram к данному userId. Bot-flow вместо виджета (iOS-safe).
export async function POST() {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { token } = await createTelegramPreauthToken(userId)
  return NextResponse.json({ nonce: token })
}
