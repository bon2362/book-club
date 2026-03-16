export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = await db
    .select({ languages: users.languages })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1)

  if (!rows.length || rows[0].languages === null) {
    return NextResponse.json({ languages: null })
  }

  return NextResponse.json({ languages: JSON.parse(rows[0].languages) as string[] })
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { languages } = await req.json() as { languages: string[] }

  const updated = await db
    .update(users)
    .set({ languages: JSON.stringify(languages) })
    .where(eq(users.id, session.user.id))
    .returning({ languages: users.languages })

  const saved = updated[0]?.languages
  return NextResponse.json({ languages: saved ? JSON.parse(saved) as string[] : languages })
}
