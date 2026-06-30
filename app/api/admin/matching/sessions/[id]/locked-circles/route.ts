export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { books, matchingLockedCircleMembers, matchingLockedCircles } from '@/lib/db/schema'
import { desc, eq, inArray } from 'drizzle-orm'

interface Params { params: { id: string } }

export async function GET(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const circles = await db
    .select({
      id: matchingLockedCircles.id,
      sessionId: matchingLockedCircles.sessionId,
      circleKey: matchingLockedCircles.circleKey,
      bookId: matchingLockedCircles.bookId,
      bookTitle: books.title,
      status: matchingLockedCircles.status,
      lockedAt: matchingLockedCircles.lockedAt,
      dissolvedAt: matchingLockedCircles.dissolvedAt,
      dissolveReason: matchingLockedCircles.dissolveReason,
    })
    .from(matchingLockedCircles)
    .leftJoin(books, eq(matchingLockedCircles.bookId, books.id))
    .where(eq(matchingLockedCircles.sessionId, params.id))
    .orderBy(desc(matchingLockedCircles.lockedAt))

  if (circles.length === 0) {
    return NextResponse.json({ success: true, data: [] })
  }

  const members = await db
    .select({
      circleId: matchingLockedCircleMembers.circleId,
      userId: matchingLockedCircleMembers.userId,
      displayNameSnapshot: matchingLockedCircleMembers.displayNameSnapshot,
      releasedAt: matchingLockedCircleMembers.releasedAt,
    })
    .from(matchingLockedCircleMembers)
    .where(inArray(matchingLockedCircleMembers.circleId, circles.map((circle) => circle.id)))
    .orderBy(
      matchingLockedCircleMembers.circleId,
      matchingLockedCircleMembers.displayNameSnapshot,
    )

  const membersByCircle = new Map<string, typeof members>()
  for (const member of members) {
    const circleMembers = membersByCircle.get(member.circleId) ?? []
    circleMembers.push(member)
    membersByCircle.set(member.circleId, circleMembers)
  }

  const data = circles.map((circle) => ({
    ...circle,
    members: membersByCircle.get(circle.id)?.map((member) => ({
      userId: member.userId,
      displayNameSnapshot: member.displayNameSnapshot,
      releasedAt: member.releasedAt,
    })) ?? [],
  }))

  return NextResponse.json({ success: true, data })
}
