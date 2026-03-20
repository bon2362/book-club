import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { notificationQueue } from '@/lib/db/schema'
import { isNull } from 'drizzle-orm'

export async function GET() {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const rows = await db
    .select({ createdAt: notificationQueue.createdAt })
    .from(notificationQueue)
    .where(isNull(notificationQueue.sentAt))

  if (rows.length === 0) {
    return NextResponse.json({ status: 'empty' })
  }

  const now = Date.now()
  const timestamps = rows.map((r) => r.createdAt.getTime())
  const latestCreatedAt = Math.max(...timestamps)
  const oldestCreatedAt = Math.min(...timestamps)
  const isCooling = latestCreatedAt > now - 30 * 60 * 1000
  const isForcedFlush = oldestCreatedAt < now - 2 * 60 * 60 * 1000

  if (isCooling && !isForcedFlush) {
    const sendAt = new Date(
      Math.min(latestCreatedAt + 30 * 60 * 1000, oldestCreatedAt + 2 * 60 * 60 * 1000)
    ).toISOString()
    return NextResponse.json({ status: 'cooling', count: rows.length, sendAt })
  }

  return NextResponse.json({ status: 'ready', count: rows.length })
}
