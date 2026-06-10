export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { notificationQueue, users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { deletePostHogPerson } from '@/lib/posthog-server'
import { withAuditContext } from '@/lib/audit/with-audit-context'

export async function DELETE() {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const userId = session.user.id
  const [targetUser] = await db
    .select({ contactEmail: users.contactEmail })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1)

  await withAuditContext(
    {
      actorUserId: userId,
      actorLabel: session.user.name ?? session.user.contactEmail ?? null,
      source: 'profile',
    },
    async (tx) => {
      if (targetUser?.contactEmail) {
        await tx
          .delete(notificationQueue)
          .where(eq(notificationQueue.userEmail, targetUser.contactEmail))
      }
      await tx.delete(users).where(eq(users.id, userId))
    },
  )
  await deletePostHogPerson(userId)

  return NextResponse.json({ ok: true })
}
