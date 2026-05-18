import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { feedback } from '@/lib/db/schema'
import { inArray } from 'drizzle-orm'
import { isTestEndpointAllowed } from '@/lib/test-mode'

function notAllowed() {
  return NextResponse.json({ error: 'Not allowed' }, { status: 403 })
}

export async function POST(req: NextRequest) {
  if (!isTestEndpointAllowed()) return notAllowed()

  const body = await req.json() as { userId?: string | null; name?: string; email?: string; message: string }
  const [row] = await db.insert(feedback).values({
    userId: body.userId ?? null,
    name: body.name ?? null,
    email: body.email ?? null,
    message: body.message,
  }).returning({ id: feedback.id })

  return NextResponse.json({ ok: true, id: row.id })
}

export async function DELETE(req: NextRequest) {
  if (!isTestEndpointAllowed()) return notAllowed()

  const { ids } = await req.json() as { ids?: string[] }
  if (!ids?.length) return NextResponse.json({ ok: true })
  await db.delete(feedback).where(inArray(feedback.id, ids))
  return NextResponse.json({ ok: true })
}
