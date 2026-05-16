export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { getAdminFeedback } from '@/lib/admin-users'

export async function GET() {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const feedback = await getAdminFeedback()
  return NextResponse.json({ success: true, data: feedback })
}
