export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { tagDescriptions } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { tag, description } = await req.json() as { tag: string; description: string }
  if (!tag) {
    return NextResponse.json({ error: 'Missing tag' }, { status: 400 })
  }

  if (!description.trim()) {
    await db.delete(tagDescriptions).where(eq(tagDescriptions.tag, tag))
  } else {
    await db.insert(tagDescriptions).values({ tag, description: description.trim() }).onConflictDoUpdate({
      target: tagDescriptions.tag,
      set: { description: description.trim() },
    })
  }

  return NextResponse.json({ ok: true })
}
