export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { revalidateTag } from 'next/cache'
import { auth } from '@/lib/auth'
import {
  createSection,
  getIntroData,
  updateSections,
  type SectionPatch,
} from '@/lib/intro'
import { withAuditContext } from '@/lib/audit/with-audit-context'

async function requireAdmin() {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return { forbidden: NextResponse.json({ error: 'Forbidden' }, { status: 403 }), session: null }
  }
  return { forbidden: null, session }
}

export async function GET() {
  const { forbidden } = await requireAdmin()
  if (forbidden) return forbidden
  const data = await getIntroData({ onlyPublished: false })
  return NextResponse.json(data)
}

export async function PUT(req: NextRequest) {
  const { forbidden, session } = await requireAdmin()
  if (forbidden) return forbidden

  const body = await req.json() as { patches?: SectionPatch[] }
  if (!Array.isArray(body.patches)) {
    return NextResponse.json({ error: 'patches[] required' }, { status: 400 })
  }
  await withAuditContext(
    {
      actorUserId: session.user.id,
      actorLabel: session.user.name ?? session.user.contactEmail ?? null,
      source: 'admin',
    },
    async (tx) => updateSections(body.patches!, tx),
  )
  revalidateTag('intro')
  return NextResponse.json({ ok: true })
}

export async function POST() {
  const { forbidden, session } = await requireAdmin()
  if (forbidden) return forbidden
  const section = await withAuditContext(
    {
      actorUserId: session.user.id,
      actorLabel: session.user.name ?? session.user.contactEmail ?? null,
      source: 'admin',
    },
    async (tx) => createSection(tx),
  )
  revalidateTag('intro')
  return NextResponse.json({ section })
}
