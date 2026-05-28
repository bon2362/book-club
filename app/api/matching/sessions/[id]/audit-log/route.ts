export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { adminViews, users } from '@/lib/db/schema'
import { eq, desc } from 'drizzle-orm'

export async function GET(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!session.user.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const rows = await db
    .select({
      id: adminViews.id,
      adminId: adminViews.adminId,
      viewedUserId: adminViews.viewedUserId,
      ts: adminViews.ts,
      adminName: users.name,
    })
    .from(adminViews)
    .leftJoin(users, eq(adminViews.adminId, users.id))
    .where(eq(adminViews.sessionId, params.id))
    .orderBy(desc(adminViews.ts))
    .limit(50)

  return NextResponse.json({ data: rows })
}
