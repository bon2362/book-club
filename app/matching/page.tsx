export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { matchingSessions, matchingSessionParticipants, users } from '@/lib/db/schema'
import { eq, and } from 'drizzle-orm'
import { fetchCatalogWithPersonalData } from '@/lib/matching/personal-list'
import { listNeedsRankingGate } from '@/lib/matching/ranking-readiness'
import { fetchMatchingPublicState, PublicMatchingStateError } from '@/lib/matching/public-state-db'
import MatchingWelcome from '@/components/nd/MatchingWelcome'
import MatchingSatisfactionFlow from '@/components/nd/MatchingSatisfactionFlow'
import MatchingBoardProvider from '@/components/nd/MatchingBoardProvider'
import BookDetailProvider from '@/components/nd/BookDetailProvider'
import MatchingRealtimeClient from '@/components/nd/MatchingRealtimeClient'
import type { MatchingPublicState } from '@/components/nd/MatchingRealtimeClient'
import type { BookParticipant } from '@/components/nd/MatchingPersonalList'
import { db as drizzle } from '@/lib/db'
import { signupBooks, bookPriorities } from '@/lib/db/schema'
import { inArray } from 'drizzle-orm'

export default async function MatchingPage({
  searchParams,
}: {
  searchParams: { as?: string }
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/')

  const isAdmin = session.user.isAdmin ?? false
  const asParam = isAdmin && searchParams.as ? searchParams.as : null
  const isImpersonating = asParam !== null
  const viewerUserId = isImpersonating ? asParam : session.user.id!

  // Find the active session
  const [activeSession] = await db
    .select({
      id: matchingSessions.id,
      name: matchingSessions.name,
      status: matchingSessions.status,
      stateVersion: matchingSessions.stateVersion,
    })
    .from(matchingSessions)
    .where(eq(matchingSessions.status, 'active'))
    .limit(1)
    .catch(() => [])

  // Also check frozen sessions if no active one
  const [anySession] = activeSession ? [activeSession] : await db
    .select({
      id: matchingSessions.id,
      name: matchingSessions.name,
      status: matchingSessions.status,
      stateVersion: matchingSessions.stateVersion,
    })
    .from(matchingSessions)
    .where(eq(matchingSessions.status, 'frozen'))
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

  const currentSession = activeSession ?? anySession

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
  if (!isImpersonating && currentSession.status === 'active' && !currentParticipant) {
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
    !isImpersonating &&
    currentSession.status === 'active' &&
    listNeedsRankingGate(personalBooks)

  // Fetch book participants for personal list chips
  const participantRows = await db
    .select({
      userId: matchingSessionParticipants.userId,
      name: users.name,
    })
    .from(matchingSessionParticipants)
    .leftJoin(users, eq(matchingSessionParticipants.userId, users.id))
    .where(eq(matchingSessionParticipants.sessionId, currentSession.id))

  const participantUserIds = participantRows.map((p) => p.userId)

  const bookParticipants: BookParticipant[] =
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
          .then((rows) =>
            rows.map((row) => ({
              userId: row.userId,
              bookId: row.bookId,
              displayName: participantRows.find((p) => p.userId === row.userId)?.name ?? row.userId,
              rank: row.rank,
              personalStatus: row.personalStatus ?? null,
            })),
          )
      : []

  if (showRankingGate) {
    return (
      <MatchingBoardProvider stateVersion={currentSession.stateVersion}>
        <BookDetailProvider
          personalBooks={personalBooks}
          viewingUserId={viewerUserId}
          frozen={false}
        >
          <MatchingSatisfactionFlow
            phase="gate"
            sessionId={currentSession.id}
            books={personalBooks}
            bookParticipants={bookParticipants}
            viewingUserId={viewerUserId}
          />
        </BookDetailProvider>
      </MatchingBoardProvider>
    )
  }

  // Board phase: fetch the public state for the realtime client
  let publicState: MatchingPublicState | null = null
  try {
    const raw = await fetchMatchingPublicState(currentSession.id, viewerUserId)
    // Derive viewerConfirmedCircleKey from participants
    const viewerRef = raw.viewer.ref
    const me = raw.participants.find((p: { ref: string; confirmedCircleKey: string | null }) => p.ref === viewerRef)
    publicState = {
      session: raw.session,
      viewer: raw.viewer,
      scenarios: raw.scenarios,
      lockedCircles: raw.lockedCircles,
      notices: raw.notices,
      viewerConfirmedCircleKey: me?.confirmedCircleKey ?? null,
    }
  } catch (error) {
    if (error instanceof PublicMatchingStateError && error.code === 'participant_missing') {
      // Participant was added by admin; state will populate after first join
      publicState = {
        session: {
          status: currentSession.status,
          stateVersion: currentSession.stateVersion,
        },
        viewer: { role: 'active', ref: viewerUserId, lockedCircleId: null },
        scenarios: [],
        lockedCircles: [],
        notices: [],
        viewerConfirmedCircleKey: null,
      }
    } else {
      throw error
    }
  }

  // Build bookTitleById for the scenarios display
  const bookTitleById = Object.fromEntries(
    personalBooks.map((b) => [b.bookId, b.title]),
  )

  const isReadOnly = currentSession.status === 'frozen'

  return (
    <MatchingBoardProvider stateVersion={currentSession.stateVersion}>
      <BookDetailProvider
        personalBooks={personalBooks}
        viewingUserId={viewerUserId}
        frozen={isReadOnly}
      >
        <div
          style={{ background: 'var(--bg)', color: 'var(--text)', minHeight: '100svh', display: 'flex', flexDirection: 'column' }}
        >
          {/* Board section: realtime client handles notices + locked circles + scenarios */}
          <div style={{ padding: '1rem', flex: 1 }}>
            <div style={{ marginBottom: '0.75rem' }}>
              <h1
                style={{
                  margin: 0,
                  fontFamily: 'var(--nd-serif)',
                  fontSize: '1.3rem',
                  fontWeight: 700,
                  color: 'var(--text)',
                }}
              >
                {currentSession.name}
              </h1>
            </div>
            <MatchingRealtimeClient
              sessionId={currentSession.id}
              initialState={publicState}
              bookTitleById={bookTitleById}
            />
          </div>

          {/* Personal list / catalog section */}
          <div style={{ padding: '1rem', borderTop: '1px solid var(--hair)' }}>
            <div style={{ marginBottom: '0.75rem' }}>
              <h2
                style={{
                  margin: 0,
                  fontFamily: 'var(--nd-serif)',
                  fontSize: '1.12rem',
                  fontWeight: 700,
                  color: 'var(--text)',
                }}
              >
                Каталог
              </h2>
              <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                Слева — книги клуба, справа — ваш список и приоритеты
              </p>
            </div>
            <MatchingSatisfactionFlow
              phase="board"
              sessionId={currentSession.id}
              books={personalBooks}
              bookParticipants={bookParticipants}
              viewingUserId={viewerUserId}
              frozen={isReadOnly}
              mutationUserId={isImpersonating ? viewerUserId : undefined}
            />
          </div>
        </div>
      </BookDetailProvider>
    </MatchingBoardProvider>
  )
}
