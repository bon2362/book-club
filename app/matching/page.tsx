export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { and, desc, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import { matchingSessionParticipants, matchingSessions, users } from '@/lib/db/schema'
import { fetchCatalogWithPersonalData } from '@/lib/matching/personal-list'
import { fetchMatchingPublicState } from '@/lib/matching/public-state-db'
import MatchingWelcome from '@/components/nd/MatchingWelcome'
import MatchingAuthGate from '@/components/nd/MatchingAuthGate'
import MatchingBoardProvider from '@/components/nd/MatchingBoardProvider'
import BookDetailProvider from '@/components/nd/BookDetailProvider'
import MatchingRealtimeClient from '@/components/nd/MatchingRealtimeClient'
import {
  isMatchingSessionOpen,
  MATCHING_CLOSED_DB_STATUSES,
  MATCHING_OPEN_DB_STATUSES,
  normalizeMatchingSessionStatus,
} from '@/lib/matching/session-status'

export default async function MatchingPage({ searchParams }: { searchParams: { as?: string } }) {
  const authSession = await auth()
  if (!authSession?.user?.id) return <MatchingAuthGate />

  const isAdmin = authSession.user.isAdmin ?? false
  const impersonatedUserId = isAdmin && searchParams.as ? searchParams.as : null
  const viewerUserId = impersonatedUserId ?? authSession.user.id

  const [openSession] = await db.select().from(matchingSessions)
    .where(inArray(matchingSessions.status, [...MATCHING_OPEN_DB_STATUSES]))
    .orderBy(desc(matchingSessions.createdAt)).limit(1).catch(() => [])
  const [closedSession] = openSession ? [openSession] : await db.select().from(matchingSessions)
    .where(inArray(matchingSessions.status, [...MATCHING_CLOSED_DB_STATUSES]))
    .orderBy(desc(matchingSessions.createdAt)).limit(1).catch(() => [])
  const currentSession = openSession ?? closedSession

  if (!currentSession) {
    if (!isAdmin) redirect('/')
    return (
      <main style={{ background: 'var(--bg)', color: 'var(--text)', minHeight: '100svh', padding: '2rem' }}>
        <h1 style={{ fontFamily: 'var(--nd-serif)', fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.75rem' }}>Матчинг</h1>
        <p style={{ color: 'var(--text-muted)', fontFamily: 'var(--nd-sans)' }}>
          Нет активной сессии. Создайте её в{' '}
          <a href="/admin?tab=matching" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>Админ-панели → Матчинг</a>.
        </p>
      </main>
    )
  }

  const [currentParticipant] = !impersonatedUserId ? await db.select({ userId: matchingSessionParticipants.userId })
    .from(matchingSessionParticipants).where(and(
      eq(matchingSessionParticipants.sessionId, currentSession.id),
      eq(matchingSessionParticipants.userId, authSession.user.id),
    )).limit(1) : [null]

  const currentStatus = normalizeMatchingSessionStatus(currentSession.status)

  if (!isAdmin && isMatchingSessionOpen(currentSession.status) && !currentParticipant) {
    const [userRow] = await db.select({ name: users.name }).from(users)
      .where(eq(users.id, authSession.user.id)).limit(1)
    return <MatchingWelcome sessionId={currentSession.id} sessionName={currentSession.name} initialName={userRow?.name ?? ''} />
  }

  const personalBooks = await fetchCatalogWithPersonalData(viewerUserId)
  const publicState = await fetchMatchingPublicState(currentSession.id, viewerUserId, undefined, {
    admin: isAdmin && !impersonatedUserId,
  })
  const booksById = Object.fromEntries(personalBooks.map((book) => [book.bookId, book]))

  return (
    <MatchingBoardProvider stateVersion={currentSession.stateVersion}>
      <BookDetailProvider
        personalBooks={personalBooks}
        viewingUserId={publicState.viewer.ref}
        frozen={currentStatus === 'closed' || (isAdmin && !impersonatedUserId)}
      >
        <MatchingRealtimeClient
          key={`matching-viewer-${viewerUserId}`}
          sessionId={currentSession.id}
          initialState={publicState}
          booksById={booksById}
          isAdmin={isAdmin}
          isImpersonating={Boolean(impersonatedUserId)}
          impersonatedUserId={impersonatedUserId ?? undefined}
          viewerDisplayName={isAdmin && !impersonatedUserId ? authSession.user.name ?? 'Организатор' : undefined}
        />
      </BookDetailProvider>
    </MatchingBoardProvider>
  )
}
