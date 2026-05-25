export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { notificationQueue, users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { deletePostHogPerson } from '@/lib/posthog-server'

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

  if (targetUser?.contactEmail) {
    await db
      .delete(notificationQueue)
      .where(eq(notificationQueue.userEmail, targetUser.contactEmail))
  }

  await db.delete(users).where(eq(users.id, userId))
  await deletePostHogPerson(userId)

  return NextResponse.json({ ok: true })
}
