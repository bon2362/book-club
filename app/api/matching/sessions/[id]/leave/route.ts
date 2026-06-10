export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { matchingSessions, matchingSessionParticipants } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { bumpSessionState } from '@/lib/matching/realtime/version'
import { captureMatchingMutationSnapshot, finalizeMatchingMutationEffects } from '@/lib/matching/mutation-effects'
import { withAuditContext } from '@/lib/audit/with-audit-context'

interface Params { params: { id: string } }

export async function DELETE(_req: NextRequest, { params }: Params) {
  const session = await auth()
  if (!session?.user?.id) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const userId = session.user.id
  const { id: sessionId } = params

  const [matchingSession] = await db
    .select({ id: matchingSessions.id, status: matchingSessions.status })
    .from(matchingSessions)
    .where(eq(matchingSessions.id, sessionId))
    .limit(1)

  if (!matchingSession) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }
  if (matchingSession.status !== 'active') {
    return NextResponse.json({ error: 'Session is not active' }, { status: 409 })
  }

  // Снимаем снапшот и псевдоним ДО удаления участника
  const [before, participantRow] = await Promise.all([
    captureMatchingMutationSnapshot(sessionId),
    db
      .select({ pseudonym: matchingSessionParticipants.pseudonym })
      .from(matchingSessionParticipants)
      .where(
        and(
          eq(matchingSessionParticipants.sessionId, sessionId),
          eq(matchingSessionParticipants.userId, userId),
        ),
      )
      .limit(1)
      .then((rows) => rows[0] ?? null),
  ])
  const pseudonym = participantRow?.pseudonym ?? 'Участник'

  // Удаляем участника
  await withAuditContext(
    { actorUserId: userId, actorLabel: session.user.name ?? session.user.contactEmail ?? null, source: 'matching' },
    async (tx) => {
      await tx
        .delete(matchingSessionParticipants)
        .where(
          and(
            eq(matchingSessionParticipants.sessionId, sessionId),
            eq(matchingSessionParticipants.userId, userId),
          ),
        )
    },
  )

  // Записываем ОДНО событие participant_left с before/after снапшотами.
  // skipMembershipGuard=true — строка участника уже удалена.
  // after-снапшот берётся внутри finalizeMatchingMutationEffects ПОСЛЕ удаления.
  await finalizeMatchingMutationEffects({
    sessionId,
    targetUserId: userId,
    actorUserId: userId,
    bookId: null,
    kind: 'participant_left',
    source: 'matching',
    before,
    skipMembershipGuard: true,
    metadata: { pseudonym },
  }).catch(() => {}) // аналитика не должна блокировать выход

  await bumpSessionState(sessionId)

  return NextResponse.json({ success: true })
}
