export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { historicalEpochs } from '@/lib/db/schema'
import { withAuditContext } from '@/lib/audit/with-audit-context'
import {
  TimelineValidationError,
  assertEpochDates,
  epochInputSchema,
  epochValues,
  firstZodMessage,
} from '@/lib/timeline/admin'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Некорректное тело запроса' }, { status: 400 })
  }

  const parsed = epochInputSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: firstZodMessage(parsed.error) }, { status: 400 })
  }

  try {
    assertEpochDates(parsed.data)
  } catch (err) {
    if (err instanceof TimelineValidationError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    throw err
  }

  const [existing] = await db
    .select({ id: historicalEpochs.id })
    .from(historicalEpochs)
    .where(eq(historicalEpochs.id, params.id))
    .limit(1)
  if (!existing) return NextResponse.json({ error: 'Эпоха не найдена' }, { status: 404 })

  await withAuditContext(
    {
      actorUserId: session.user.id,
      actorLabel: session.user.name ?? session.user.contactEmail ?? null,
      source: 'admin',
      reason: 'Правка эпохи ленты времени',
    },
    async (tx) =>
      tx
        .update(historicalEpochs)
        .set({ ...epochValues(parsed.data), updatedAt: new Date() })
        .where(eq(historicalEpochs.id, params.id)),
  )

  return NextResponse.json({ success: true, data: { id: params.id, ...epochValues(parsed.data) } })
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Связи с таймлайнами уходят каскадом (`timeline_epochs` → ON DELETE CASCADE).
  await withAuditContext(
    {
      actorUserId: session.user.id,
      actorLabel: session.user.name ?? session.user.contactEmail ?? null,
      source: 'admin',
      reason: 'Удаление эпохи ленты времени',
    },
    async (tx) => tx.delete(historicalEpochs).where(eq(historicalEpochs.id, params.id)),
  )

  return NextResponse.json({ success: true })
}
