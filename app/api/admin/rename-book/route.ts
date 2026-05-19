export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { signupBooks, bookPriorities } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { oldName, newName } = await req.json() as { oldName?: string; newName?: string }
  if (!oldName?.trim() || !newName?.trim()) {
    return NextResponse.json({ error: 'oldName and newName are required' }, { status: 400 })
  }

  const [updatedSignups, updatedPriorities] = await Promise.all([
    db.update(signupBooks)
      .set({ bookName: newName })
      .where(eq(signupBooks.bookName, oldName))
      .returning(),
    db.update(bookPriorities)
      .set({ bookName: newName })
      .where(eq(bookPriorities.bookName, oldName))
      .returning(),
  ])

  return NextResponse.json({
    ok: true,
    updatedSignups: updatedSignups.length,
    updatedPriorities: updatedPriorities.length,
  })
}
