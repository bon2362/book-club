export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { collectionErrorResponse, requireAdminSession } from '@/lib/collections/http'
import { listAdminQueue } from '@/lib/collections/repo'

export async function GET() {
  const { forbidden } = await requireAdminSession(auth)
  if (forbidden) return forbidden
  try {
    return NextResponse.json({ queue: await listAdminQueue() })
  } catch (error) {
    return collectionErrorResponse(error)
  }
}
