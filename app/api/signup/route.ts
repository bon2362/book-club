import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { upsertSignup } from '@/lib/signups'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.email) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { name, contacts, selectedBooks } = body

  if (!name?.trim() || !contacts?.trim() || !Array.isArray(selectedBooks)) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  await upsertSignup({
    userId: session.user.email,
    name: name.trim(),
    email: session.user.email,
    contacts: contacts.trim(),
    selectedBooks,
  })

  return NextResponse.json({ ok: true })
}
