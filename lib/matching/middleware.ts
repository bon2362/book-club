import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { matchingSessions, adminViews } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'

export interface MatchingContext {
  userId: string
  actorUserId: string
  viewedUserId: string | null
  isImpersonating: boolean
  sessionId?: string
}

type Handler = (req: NextRequest, ctx: { params: Record<string, string> }) => Promise<Response>

interface Options {
  mutates?: boolean
}

export function withMatchingGuards(handler: Handler, options: Options = {}): Handler {
  const { mutates = false } = options

  return async (req: NextRequest, ctx: { params: Record<string, string> }) => {
    const session = await auth()
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const callerId = session.user.id
    const isAdmin = session.user.isAdmin ?? false

    // Handle ?as= impersonation
    const asParam = req.nextUrl.searchParams.get('as')
    let viewedUserId: string | null = null
    let isImpersonating = false

    if (asParam && isAdmin) {
      viewedUserId = asParam
      isImpersonating = true
    }
    // Non-admin with ?as= → silently ignore

    // For mutating endpoints, verify active non-frozen session
    if (mutates) {
      const sessionId = ctx.params.id ?? req.nextUrl.searchParams.get('session')
      if (sessionId) {
        const [matchSession] = await db
          .select({ status: matchingSessions.status })
          .from(matchingSessions)
          .where(eq(matchingSessions.id, sessionId))
          .limit(1)

        if (!matchSession) {
          return NextResponse.json({ error: 'Session not found' }, { status: 404 })
        }
        if (matchSession.status === 'frozen') {
          return NextResponse.json({ error: 'Session is frozen' }, { status: 409 })
        }
      } else {
        // No sessionId provided — look for active session
        const [activeSession] = await db
          .select({ status: matchingSessions.status })
          .from(matchingSessions)
          .where(eq(matchingSessions.status, 'active'))
          .limit(1)

        if (!activeSession) {
          return NextResponse.json({ error: 'No active session' }, { status: 404 })
        }
      }
    }

    const response = await handler(req, ctx)

    // Async audit log for successful impersonated reads
    if (isImpersonating && !mutates && response.status >= 200 && response.status < 300) {
      const sessionId = ctx.params.id ?? req.nextUrl.searchParams.get('session') ?? null
      // Fire-and-forget
      db.insert(adminViews).values({
        adminId: callerId,
        viewedUserId: viewedUserId!,
        sessionId,
      }).catch(() => {
        // audit log failure is non-critical
      })
    }

    // Set effective userId in response header for downstream use
    return response
  }
}

// Helper to extract effective userId from request (handles ?as= for admins)
export async function resolveActorId(req: NextRequest): Promise<{ userId: string; isImpersonating: boolean }> {
  const session = await auth()
  if (!session?.user?.id) return { userId: '', isImpersonating: false }

  const asParam = req.nextUrl.searchParams.get('as')
  const isAdmin = session.user.isAdmin ?? false

  if (asParam && isAdmin) {
    return { userId: asParam, isImpersonating: true }
  }
  return { userId: session.user.id, isImpersonating: false }
}
