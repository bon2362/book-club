export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { auth } from '@/lib/auth'
import {
  getMatchingInstructions,
  normalizeMatchingInstructions,
  updateMatchingInstructions,
  type MatchingInstructions,
} from '@/lib/matching/instructions'
import { withAuditContext } from '@/lib/audit/with-audit-context'

async function requireAdmin() {
  const session = await auth()
  if (!session?.user?.isAdmin) return { forbidden: NextResponse.json({ error: 'Forbidden' }, { status: 403 }), session: null }
  return { forbidden: null, session }
}

export async function GET() {
  const { forbidden } = await requireAdmin()
  if (forbidden) return forbidden
  return NextResponse.json(await getMatchingInstructions())
}

export async function PUT(request: NextRequest) {
  const { forbidden, session } = await requireAdmin()
  if (forbidden) return forbidden

  try {
    const instructions = normalizeMatchingInstructions(await request.json() as MatchingInstructions)
    const saved = await withAuditContext({
      actorUserId: session.user.id,
      actorLabel: session.user.name ?? session.user.contactEmail ?? null,
      source: 'admin',
    }, (tx) => updateMatchingInstructions(instructions, tx))
    revalidatePath('/matching')
    return NextResponse.json(saved)
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid instructions' }, { status: 400 })
  }
}
