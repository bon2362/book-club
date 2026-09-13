import { NextResponse, type NextRequest } from 'next/server'
import type { AuthSession } from '@/lib/signup-selection'
import { CollectionError, isMissingCollectionsSchemaError, type CollectionErrorCode } from './errors'
import type { CollectionSnapshot, CollectionViewer } from './types'

const STATUS_BY_CODE: Record<CollectionErrorCode, number> = {
  not_found: 404,
  forbidden: 403,
  invalid_transition: 409,
  validation: 400,
  book_not_published: 400,
  migration_required: 409,
}

export function collectionErrorResponse(error: unknown): NextResponse {
  if (error instanceof CollectionError) {
    return NextResponse.json({ error: error.code, ...error.details }, { status: STATUS_BY_CODE[error.code] })
  }
  if (isMissingCollectionsSchemaError(error)) {
    return NextResponse.json({ error: 'migration_required' }, { status: 409 })
  }
  console.error('collections route failed', error)
  return NextResponse.json({ error: 'collections_failed' }, { status: 500 })
}

export function collectionAuditContext(session: AuthSession, source: 'collections' | 'admin') {
  return {
    actorUserId: session.user.id,
    actorLabel: session.user.name ?? session.user.contactEmail ?? null,
    source,
  }
}

type MaybeSession = { user?: { id?: string | null; isAdmin?: boolean | null } | null } | null | undefined

export function viewerFromSession(session: MaybeSession): CollectionViewer {
  return { userId: session?.user?.id ?? null, isAdmin: Boolean(session?.user?.isAdmin) }
}

export async function readContentBody(req: NextRequest): Promise<CollectionSnapshot> {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null
  if (!body || typeof body !== 'object') {
    throw new CollectionError('validation', { issues: ['invalid_body'] })
  }
  const text = (value: unknown) => (typeof value === 'string' ? value : '')
  return {
    title: text(body.title),
    descriptionMarkdown: text(body.descriptionMarkdown),
    displayName: text(body.displayName),
    bookIds: Array.isArray(body.bookIds) ? body.bookIds.filter((id): id is string => typeof id === 'string') : [],
  }
}

export async function requireAdminSession(
  getSession: () => Promise<unknown>,
): Promise<{ session: AuthSession; forbidden: null } | { session: null; forbidden: NextResponse }> {
  const session = await getSession() as AuthSession | null
  if (!session?.user?.id || !session.user.isAdmin) {
    return { session: null, forbidden: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  }
  return { session, forbidden: null }
}
