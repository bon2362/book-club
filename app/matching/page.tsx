export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { matchingSessions, matchingSessionParticipants, users } from '@/lib/db/schema'
import { eq, and, desc, inArray } from 'drizzle-orm'
import { fetchCatalogWithPersonalData } from '@/lib/matching/personal-list'
import { listCanEnterSession } from '@/lib/matching/ranking-readiness'
import { fetchMatchingPublicState, PublicMatchingStateError } from '@/lib/matching/public-state-db'
import MatchingWelcome from '@/components/nd/MatchingWelcome'
import MatchingAuthGate from '@/components/nd/MatchingAuthGate'
import MatchingSatisfactionFlow from '@/components/nd/MatchingSatisfactionFlow'
import MatchingBoardProvider from '@/components/nd/MatchingBoardProvider'
import BookDetailProvider from '@/components/nd/BookDetailProvider'
import MatchingRealtimeClient from '@/components/nd/MatchingRealtimeClient'
import type { MatchingPublicState } from '@/components/nd/MatchingRealtimeClient'
import type { BookParticipant } from '@/components/nd/MatchingPersonalList'
import { db as drizzle } from '@/lib/db'
import { signupBooks, bookPriorities } from '@/lib/db/schema'
import { buildPublicBookParticipants } from '@/lib/matching/book-participants'

export default async function MatchingPage({
  searchParams,
}: {
  searchParams: { as?: string }
}) {
  const session = await auth()
  if (!session?.user?.id) return <MatchingAuthGate />

  const isAdmin = session.user.isAdmin ?? false
  const asParam = isAdmin && searchParams.as ? searchParams.as : null
  const isImpersonating = asParam !== null
  const viewerUserId = isImpersonating ? asParam : session.user.id!

  // Prefer the canonical open session while keeping legacy active sessions readable
  // during the additive rollout.
  const [openSession] = await db
    .select({
      id: matchingSessions.id,
      name: matchingSessions.name,
      status: matchingSessions.status,
      stateVersion: matchingSessions.stateVersion,
      minGroupSize: matchingSessions.minGroupSize,
      maxGroupSize: matchingSessions.maxGroupSize,
      deadlineAt: matchingSessions.deadlineAt,
      bookModeInitializedAt: matchingSessions.bookModeInitializedAt,
    })
    .from(matchingSessions)
    .where(inArray(matchingSessions.status, ['open', 'active']))
    .orderBy(desc(matchingSessions.createdAt))
    .limit(1)
    .catch(() => [])

  // The newest closed session remains current until another session is opened.
  const [anySession] = openSession ? [openSession] : await db
    .select({
      id: matchingSessions.id,
      name: matchingSessions.name,
      status: matchingSessions.status,
      stateVersion: matchingSessions.stateVersion,
      minGroupSize: matchingSessions.minGroupSize,
      maxGroupSize: matchingSessions.maxGroupSize,
      deadlineAt: matchingSessions.deadlineAt,
      bookModeInitializedAt: matchingSessions.bookModeInitializedAt,
    })
    .from(matchingSessions)
    .where(inArray(matchingSessions.status, ['closed', 'frozen']))
    .orderBy(desc(matchingSessions.createdAt))
    .limit(1)
    .catch(() => [])

  if (!anySession) {
    if (!isAdmin) redirect('/')
    return (
      <main
        style={{ background: 'var(--bg)', color: 'var(--text)', minHeight: '100svh', padding: '2rem' }}
      >
        <h1 style={{ fontFamily: 'var(--nd-serif)', fontSize: '1.4rem', fontWeight: 700, marginBottom: '0.75rem' }}>
          Матчинг
        </h1>
        <p style={{ color: 'var(--text-muted)', fontFamily: 'var(--nd-sans)' }}>
          Нет активной сессии. Создайте её в{' '}
          <a href="/admin?tab=matching" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>
            Админ-панели → Матчинг
          </a>
          .
        </p>
      </main>
    )
  }

  const currentSession = openSession ?? anySession
  const sessionIsOpen = currentSession.status === 'open' || currentSession.status === 'active'

  // Check if the viewer is already a participant
  const [currentParticipant] = !isImpersonating
    ? await db
        .select({ userId: matchingSessionParticipants.userId })
        .from(matchingSessionParticipants)
        .where(
          and(
            eq(matchingSessionParticipants.sessionId, currentSession.id),
            eq(matchingSessionParticipants.userId, session.user.id!),
          ),
        )
        .limit(1)
    : [null]

  // Not joined + active session → Welcome
  if (!isAdmin && !isImpersonating && sessionIsOpen && !currentParticipant) {
    // Fetch user's current global name
    const [userRow] = await db
      .select({ name: users.name })
      .from(users)
      .where(eq(users.id, session.user.id!))
      .limit(1)

    return (
      <MatchingWelcome
        sessionId={currentSession.id}
        sessionName={currentSession.name}
        initialName={userRow?.name ?? ''}
      />
    )
  }

  // Viewer is a participant (or impersonating). Fetch personal books.
  const personalBooks = await fetchCatalogWithPersonalData(viewerUserId)

  // Ranking Gate: joined + active session + has unranked active books
  const showRankingGate =
    !isAdmin &&
    !isImpersonating &&
    sessionIsOpen &&
    !currentSession.bookModeInitializedAt &&
    !listCanEnterSession(personalBooks)

  // Fetch book participants for personal list chips
  const participantRows = await db
    .select({
      userId: matchingSessionParticipants.userId,
      publicRef: matchingSessionParticipants.publicRef,
      joinedAt: matchingSessionParticipants.joinedAt,
      name: users.name,
    })
    .from(matchingSessionParticipants)
    .leftJoin(users, eq(matchingSessionParticipants.userId, users.id))
    .where(eq(matchingSessionParticipants.sessionId, currentSession.id))

  const participantUserIds = participantRows.map((p) => p.userId)
  const viewingParticipantRef = participantRows.find((p) => p.userId === viewerUserId)?.publicRef ?? 'viewer'

  const bookParticipantRows =
    participantUserIds.length > 0
      ? await drizzle
          .select({
            userId: signupBooks.userId,
            bookId: signupBooks.bookId,
            rank: bookPriorities.rank,
            personalStatus: signupBooks.personalStatus,
          })
          .from(signupBooks)
          .leftJoin(
            bookPriorities,
            and(
              eq(bookPriorities.userId, signupBooks.userId),
              eq(bookPriorities.bookId, signupBooks.bookId),
            ),
          )
          .where(inArray(signupBooks.userId, participantUserIds))
          .then((rows) => rows.map((row) => ({ ...row, personalStatus: row.personalStatus ?? null })))
      : []
  const bookParticipants: BookParticipant[] = buildPublicBookParticipants({
    participants: participantRows,
    signups: bookParticipantRows,
  })

  // Board phase: fetch the public state for the realtime client
  let publicState: MatchingPublicState | null = null
  if (!showRankingGate) {
    try {
      const raw = await fetchMatchingPublicState(currentSession.id, viewerUserId, undefined, {
        admin: isAdmin && !isImpersonating,
      })
      // Derive viewerConfirmedCircleKey from participants
      const viewerRef = raw.viewer.ref
      const me = raw.participants.find((p: { ref: string; confirmedCircleKey: string | null }) => p.ref === viewerRef)
      publicState = {
        session: raw.session,
        viewer: raw.viewer,
        participants: raw.participants,
        scenarios: raw.scenarios,
        lockedCircles: raw.lockedCircles,
        notices: raw.notices,
        viewerConfirmedCircleKey: me?.confirmedCircleKey ?? null,
        bookMode: raw.bookMode,
      }
    } catch (error) {
      if (error instanceof PublicMatchingStateError && error.code === 'participant_missing') {
        // Participant was added by admin; state will populate after first join
        publicState = {
          session: {
            name: currentSession.name,
            status: currentSession.status,
            stateVersion: currentSession.stateVersion,
            minGroupSize: currentSession.minGroupSize,
            maxGroupSize: currentSession.maxGroupSize,
            deadlineAt: currentSession.deadlineAt?.toISOString() ?? null,
          },
          viewer: { role: 'active', ref: 'viewer', lockedCircleKey: null },
          participants: [],
          scenarios: [],
          lockedCircles: [],
          notices: [],
          viewerConfirmedCircleKey: null,
          bookMode: null,
        }
      } else {
        throw error
      }
    }
  }

  // Full published-book metadata powers covers and the shared book-detail popup.
  const booksById = showRankingGate
    ? {}
    : Object.fromEntries(personalBooks.map((book) => [book.bookId, book]))

  const isReadOnly = currentSession.status === 'frozen' || currentSession.status === 'closed'

  return (
    <MatchingBoardProvider stateVersion={currentSession.stateVersion}>
      <BookDetailProvider
        personalBooks={personalBooks}
        viewingUserId={viewingParticipantRef}
        frozen={isReadOnly || (isAdmin && !isImpersonating)}
      >
        <MatchingSatisfactionFlow
              phase={showRankingGate ? 'gate' : 'board'}
              sessionId={currentSession.id}
              books={personalBooks}
              bookParticipants={bookParticipants}
              viewingUserId={viewingParticipantRef}
              frozen={isReadOnly}
              mutationUserId={isImpersonating ? viewerUserId : undefined}
              workspace={showRankingGate ? undefined : <MatchingRealtimeClient
                sessionId={currentSession.id}
                initialState={publicState!}
                booksById={booksById}
                isAdmin={isAdmin}
                isImpersonating={isImpersonating}
                viewerDisplayName={isAdmin && !isImpersonating ? session.user.name ?? 'Организатор' : undefined}
              />}
              catalogIntro={showRankingGate ? undefined : <div data-testid="matching-catalog-intro" style={{ marginBottom: '0.75rem', borderTop: '1px solid var(--border)', paddingTop: '1rem' }}><h2 style={{ margin: 0, fontFamily: 'var(--nd-serif)', fontSize: '1.12rem' }}>Каталог</h2><p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Слева — книги клуба, справа — ваш список и приоритеты</p></div>}
            />
      </BookDetailProvider>
    </MatchingBoardProvider>
  )
}
