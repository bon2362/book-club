export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import {
  SUMMARY_HELPFUL_COOKIE,
  SUMMARY_HELPFUL_COOKIE_PATH,
  SummaryHelpfulNotFoundError,
  hashHelpfulVisitorCookie,
  reconcileSummaryHelpful,
} from '@/lib/summary-helpful'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let summaryId: string
  try {
    const body = await req.json() as { summaryId?: unknown }
    summaryId = typeof body.summaryId === 'string' ? body.summaryId.trim() : ''
  } catch {
    summaryId = ''
  }
  if (!summaryId) {
    return NextResponse.json({ error: 'summaryId is required' }, { status: 400 })
  }

  const visitorId = req.cookies.get(SUMMARY_HELPFUL_COOKIE)?.value
  const visitorHash = hashHelpfulVisitorCookie(visitorId)
  try {
    const state = await reconcileSummaryHelpful(summaryId, session.user.id, visitorHash ?? undefined)
    const response = NextResponse.json(state)
    response.headers.set('Cache-Control', 'private, no-store')
    if (visitorHash) {
      response.cookies.set(SUMMARY_HELPFUL_COOKIE, '', {
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        path: SUMMARY_HELPFUL_COOKIE_PATH,
        maxAge: 0,
      })
    }
    return response
  } catch (error) {
    if (error instanceof SummaryHelpfulNotFoundError) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
