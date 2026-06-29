export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import {
  SUMMARY_HELPFUL_COOKIE,
  SUMMARY_HELPFUL_COOKIE_PATH,
  SUMMARY_HELPFUL_MAX_AGE,
  SummaryHelpfulNotFoundError,
  addSummaryHelpful,
  createHelpfulVisitorActor,
  getSummaryHelpfulState,
  hashHelpfulVisitorCookie,
  removeSummaryHelpful,
  type HelpfulActor,
  type HelpfulState,
} from '@/lib/summary-helpful'

function privateResponse(state: HelpfulState): NextResponse {
  const response = NextResponse.json(state)
  response.headers.set('Cache-Control', 'private, no-store')
  return response
}

function setVisitorCookie(response: NextResponse, visitorId: string): void {
  response.cookies.set(SUMMARY_HELPFUL_COOKIE, visitorId, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: SUMMARY_HELPFUL_COOKIE_PATH,
    maxAge: SUMMARY_HELPFUL_MAX_AGE,
  })
}

function errorResponse(error: unknown): NextResponse {
  if (error instanceof SummaryHelpfulNotFoundError) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }
  return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
}

async function requestActor(req: NextRequest): Promise<{
  actor: HelpfulActor | null
  existingVisitorId?: string
}> {
  const session = await auth()
  const visitorId = req.cookies.get(SUMMARY_HELPFUL_COOKIE)?.value
  const visitorHash = hashHelpfulVisitorCookie(visitorId)
  if (session?.user?.id) {
    return {
      actor: {
        kind: 'user',
        userId: session.user.id,
        ...(visitorHash ? { visitorHash } : {}),
      },
      ...(visitorHash && visitorId ? { existingVisitorId: visitorId } : {}),
    }
  }
  if (visitorHash && visitorId) {
    return { actor: { kind: 'visitor', visitorHash }, existingVisitorId: visitorId }
  }
  return { actor: null }
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { actor, existingVisitorId } = await requestActor(req)
    const response = privateResponse(await getSummaryHelpfulState(params.id, actor))
    if (existingVisitorId) setVisitorCookie(response, existingVisitorId)
    return response
  } catch (error) {
    return errorResponse(error)
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const resolved = await requestActor(req)
    const actor = resolved.actor ?? createHelpfulVisitorActor()
    const response = privateResponse(await addSummaryHelpful(params.id, actor))
    const visitorId = resolved.existingVisitorId ?? (actor.kind === 'new-visitor' ? actor.visitorId : undefined)
    if (visitorId) setVisitorCookie(response, visitorId)
    return response
  } catch (error) {
    return errorResponse(error)
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const { actor, existingVisitorId } = await requestActor(req)
    const response = privateResponse(await removeSummaryHelpful(params.id, actor))
    if (existingVisitorId) setVisitorCookie(response, existingVisitorId)
    return response
  } catch (error) {
    return errorResponse(error)
  }
}
