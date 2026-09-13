import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { saveSignupSelection, type AuthSession } from '@/lib/signup-selection'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { name, contacts, selectedBookIds } = body

  if (!name?.trim() || typeof contacts !== 'string' || !Array.isArray(selectedBookIds)) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  return saveSignupSelection(session as unknown as AuthSession, { name, contacts, selectedBookIds })
}
