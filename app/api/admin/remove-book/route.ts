export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { removeBookFromSignup } from '@/lib/signups'

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { userId, bookName } = await req.json() as { userId: string; bookName: string }
  if (!userId || !bookName) {
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  }

  await removeBookFromSignup(userId, bookName)
  return NextResponse.json({ ok: true })
}
