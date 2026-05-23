export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { bestEffortRecordUserActivity, buildUserActivityDedupeKey, type UserActivityMetadata } from '@/lib/user-activity'

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

  let body: { languages?: unknown; name?: unknown; contacts?: unknown }
  try {
    body = await req.json() as { languages?: unknown; name?: unknown; contacts?: unknown }
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const updates: {
    languages?: string
    name?: string
    contacts?: string
  } = {}
  const metadata: UserActivityMetadata = {}

  if ('languages' in body) {
    if (!Array.isArray(body.languages) || !body.languages.every(x => typeof x === 'string')) {
      return NextResponse.json({ error: 'Invalid languages' }, { status: 400 })
    }
    updates.languages = JSON.stringify(body.languages)
    metadata.languages = body.languages
  }

  if ('name' in body || 'contacts' in body) {
    if (typeof body.name !== 'string' || !body.name.trim() || typeof body.contacts !== 'string') {
      return NextResponse.json({ error: 'Invalid profile' }, { status: 400 })
    }
    updates.name = body.name.trim()
    updates.contacts = body.contacts.trim()
    metadata.name = updates.name
    metadata.contacts = updates.contacts
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No profile fields to update' }, { status: 400 })
  }

  const updated = await db
    .update(users)
    .set(updates)
    .where(eq(users.id, session.user.id))
    .returning({
      name: users.name,
      contacts: users.contacts,
      languages: users.languages,
    })

  if (updated.length === 0) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 })
  }

  await bestEffortRecordUserActivity(session.user.id, 'profile_updated', {
    source: 'api',
    sourceId: session.user.id,
    dedupeKey: buildUserActivityDedupeKey(['api', 'profile_updated', session.user.id, JSON.stringify(metadata)]),
    metadata,
  })

  const saved = updated[0]
  return NextResponse.json({
    name: saved.name,
    contacts: saved.contacts,
    languages: saved.languages ? JSON.parse(saved.languages) as string[] : null,
  })
}
