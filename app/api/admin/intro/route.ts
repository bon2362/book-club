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

async function requireAdmin() {
  const session = await auth()
  if (!session?.user?.isAdmin) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return null
}

export async function GET() {
  const forbidden = await requireAdmin()
  if (forbidden) return forbidden
  const data = await getIntroData({ onlyPublished: false })
  return NextResponse.json(data)
}

export async function PUT(req: NextRequest) {
  const forbidden = await requireAdmin()
  if (forbidden) return forbidden

  const body = await req.json() as { patches?: SectionPatch[] }
  if (!Array.isArray(body.patches)) {
    return NextResponse.json({ error: 'patches[] required' }, { status: 400 })
  }
  await updateSections(body.patches)
  revalidateTag('intro')
  return NextResponse.json({ ok: true })
}

export async function POST() {
  const forbidden = await requireAdmin()
  if (forbidden) return forbidden
  const section = await createSection()
  revalidateTag('intro')
  return NextResponse.json({ section })
}
