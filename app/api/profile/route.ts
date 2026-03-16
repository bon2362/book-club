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

  let languages: string[]
  try {
    const body = await req.json() as { languages: unknown }
    if (!Array.isArray(body.languages) || !body.languages.every(x => typeof x === 'string')) {
      return NextResponse.json({ error: 'Invalid languages' }, { status: 400 })
    }
    languages = body.languages
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const updated = await db
    .update(users)
    .set({ languages: JSON.stringify(languages) })
    .where(eq(users.id, session.user.id))
    .returning({ languages: users.languages })

  if (updated.length === 0) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  const saved = updated[0].languages
  return NextResponse.json({ languages: saved ? JSON.parse(saved) as string[] : languages })
}
