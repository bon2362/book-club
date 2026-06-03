export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { matchingSessions, matchingSessionParticipants, users, signupBooks, bookPriorities, books } from '@/lib/db/schema'
import { eq, inArray, and } from 'drizzle-orm'
import { fetchCatalogWithPersonalData } from '@/lib/matching/personal-list'
import { emptyScenarioSetOverview, generateScenarioSets } from '@/lib/matching/scenarios'
import type { GenerateScenariosInput, MatchingScenario } from '@/lib/matching/scenarios'
import { fetchMyMoves } from '@/lib/matching/my-moves'
import type { MyMoveBook } from '@/lib/matching/my-moves'
import MatchingPersonalList from '@/components/nd/MatchingPersonalList'
import type { BookParticipant } from '@/components/nd/MatchingPersonalList'
import MatchingImpactWorkspace from '@/components/nd/MatchingImpactWorkspace'
import MatchingRealtimeWrapper from '@/components/nd/MatchingRealtimeWrapper'
import MatchingHeader from '@/components/nd/MatchingHeader'
import MatchingWelcome from '@/components/nd/MatchingWelcome'
import { buildMoveImpact, sortMovesByImpact } from '@/lib/matching/move-impact'
import { getOrCreatePseudonymReservation } from '@/lib/matching/pseudonym-reservations'
import { fetchFeedForSession } from '@/lib/matching/realtime/feed'
import { fetchAdriftCauseForUser, isViewerAdrift } from '@/lib/matching/adrift'

export default async function MatchingPage({
  searchParams,
}: {
  searchParams: { as?: string }
}) {
  const session = await auth()
  if (!session?.user?.id) redirect('/')

  const isAdmin = session.user.isAdmin ?? false

  // Admin impersonation: ?as=userId silently ignored for non-admins
  const asParam = isAdmin && searchParams.as ? searchParams.as : null
  const isImpersonating = asParam !== null
  const viewingUserId = isImpersonating ? asParam : session.user.id!

  const [activeSession] = await db
    .select()
    .from(matchingSessions)
    .where(eq(matchingSessions.status, 'active'))
    .limit(1)

  if (!activeSession) {
    return (
      <main
        className="p-8 max-w-2xl mx-auto"
        style={{ background: 'var(--bg)', color: 'var(--text)', minHeight: '100svh' }}
      >
        <h1 className="text-lg font-semibold mb-4">Матчинг</h1>
        <p style={{ color: 'var(--text-muted)' }}>
          Нет активной сессии. Создайте её в{' '}
          <a
            href="/admin?tab=matching"
            className="underline"
            style={{ color: 'var(--accent)' }}
          >
            Админ-панели → Матчинг
          </a>
          .
        </p>
      </main>
    )
  }

  const [currentParticipant] = !isImpersonating
    ? await db
        .select({ pseudonym: matchingSessionParticipants.pseudonym })
        .from(matchingSessionParticipants)
        .where(
          and(
            eq(matchingSessionParticipants.sessionId, activeSession.id),
            eq(matchingSessionParticipants.userId, session.user.id!),
          ),
        )
        .limit(1)
    : []

  if (!isImpersonating && activeSession.status === 'active' && !currentParticipant) {
    const pseudonym = await getOrCreatePseudonymReservation(activeSession.id, session.user.id!)
    return (
      <MatchingWelcome
        sessionId={activeSession.id}
        sessionName={activeSession.name}
        pseudonym={pseudonym}
      />
    )
  }

  const [participants, personalBooks, myMoves] = await Promise.all([
    db
      .select({
        userId: matchingSessionParticipants.userId,
        pseudonym: matchingSessionParticipants.pseudonym,
        joinedAt: matchingSessionParticipants.joinedAt,
        name: users.name,
      })
      .from(matchingSessionParticipants)
      .leftJoin(users, eq(matchingSessionParticipants.userId, users.id))
      .where(eq(matchingSessionParticipants.sessionId, activeSession.id))
      .orderBy(matchingSessionParticipants.joinedAt),
    fetchCatalogWithPersonalData(viewingUserId),
    fetchMyMoves(viewingUserId, activeSession.id, activeSession.minGroupSize),
  ])

  const participantUserIds = participants.map((p) => p.userId)
  const viewedParticipant = isImpersonating
    ? participants.find((p) => p.userId === asParam)
    : null

  // Fetch per-book participant signups for chips in the popup (all catalog books, not just user's list)
  const bookParticipants: BookParticipant[] =
    participantUserIds.length > 0
      ? await db
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
            rows.map((row) => {
              const participant = participants.find((p) => p.userId === row.userId)
              return {
                userId: row.userId,
                bookId: row.bookId,
                pseudonym: participant?.pseudonym ?? row.userId,
                rank: row.rank,
                personalStatus: row.personalStatus ?? null,
              }
            }),
          )
      : []

  const scenarioParticipants = participants.map((p) => ({ userId: p.userId, pseudonym: p.pseudonym }))
  const scenarioInput = await fetchScenarioInput(
    scenarioParticipants,
    activeSession.minGroupSize,
    activeSession.maxGroupSize,
  )
  const scenarioSetOverview =
    participantUserIds.length >= activeSession.minGroupSize
      ? generateScenarioSets(scenarioInput)
      : emptyScenarioSetOverview(scenarioParticipants, activeSession.minGroupSize, activeSession.maxGroupSize)

  const bookTitleById = new Map(personalBooks.map((book) => [book.bookId, book.title]))
  const feedEvents = await fetchFeedForSession(activeSession.id)
  const feedBookTitles = Object.fromEntries(bookTitleById)
  const myMovesWithImpact = addMoveImpacts(
    myMoves,
    scenarioInput,
    viewingUserId,
    bookTitleById,
    scenarioSetOverview.leader,
  )
  const bookById = new Map(personalBooks.map((b) => [b.bookId, {
    ...b,
    id: b.bookId,
    tags: Array.isArray(b.tags) ? b.tags : [],
  }]))

  const isReadOnly = activeSession.status === 'frozen'
  const viewerIsAdrift = isViewerAdrift(scenarioSetOverview, viewingUserId)
  const adriftCause = viewerIsAdrift
    ? await fetchAdriftCauseForUser(activeSession.id, viewingUserId)
    : null
  const adrift = viewerIsAdrift
    ? {
        reason: adriftCause ? 'change' as const : 'never' as const,
        cause: adriftCause
          ? {
              ...adriftCause,
              bookTitle: bookTitleById.get(adriftCause.bookId) ?? null,
            }
          : null,
      }
    : null

  // Get current user's pseudonym (not impersonating) or null if impersonating
  const userPseudonym = !isImpersonating
    ? participants.find((p) => p.userId === session.user.id)?.pseudonym ?? null
    : null

  return (
    <div
      className="flex flex-col"
      style={{ minHeight: '100svh', background: 'var(--bg)', color: 'var(--text)' }}
    >
      <div className="flex flex-col" style={{ height: '100svh' }}>
        <MatchingHeader
          sessionId={activeSession.id}
          sessionName={activeSession.name}
          sessionStatus={activeSession.status}
          minGroupSize={activeSession.minGroupSize}
          maxGroupSize={activeSession.maxGroupSize}
          deadlineAt={activeSession.deadlineAt ? new Date(activeSession.deadlineAt).toISOString() : null}
          participants={participants.map((p) => ({ userId: p.userId, pseudonym: p.pseudonym, name: p.name ?? null }))}
          isAdmin={isAdmin}
          isImpersonating={isImpersonating}
          viewedPseudonym={viewedParticipant?.pseudonym ?? null}
          viewedName={viewedParticipant?.name ?? null}
          asParam={asParam}
          userPseudonym={userPseudonym}
          feedEvents={feedEvents}
          feedBookTitles={feedBookTitles}
        />

        {/* First viewport: scenarios + moves */}
        <div className="flex-1 min-h-0 p-4">
          <MatchingImpactWorkspace
            overview={scenarioSetOverview}
            bookById={bookById}
            bookParticipants={bookParticipants}
            viewingUserId={viewingUserId}
            moves={myMovesWithImpact}
            frozen={isReadOnly}
            movesHeading={isImpersonating ? 'Ходы участника' : 'Мои ходы'}
            mutationUserId={isImpersonating ? viewingUserId : undefined}
            adrift={adrift}
          />
        </div>
      </div>

      {/* Second viewport: catalog and user's books */}
      <div className="p-4 pt-0" style={{ minHeight: 560 }} data-testid="matching-catalog-panel">
        {/* Catalog intro — same serif style as panel headings above */}
        <div style={{ padding: '1.4rem 0 1rem' }}>
          <h2
            style={{
              margin: 0,
              fontFamily: 'var(--nd-serif)',
              fontSize: '1.12rem',
              fontWeight: 700,
              letterSpacing: '-0.01em',
              color: 'var(--text)',
            }}
          >
            {isImpersonating ? 'Список участника' : 'Каталог'}
          </h2>
          {!isImpersonating && (
            <p style={{ margin: '0.2rem 0 0', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              Слева — книги клуба, справа — ваш список и приоритеты
            </p>
          )}
        </div>

        {/* Two-column grid aligned with top row — MatchingPersonalList renders a fragment with two sections */}
        <div
          className="grid"
          style={{
            gridTemplateColumns: 'minmax(0, 1.18fr) minmax(0, 0.82fr)',
            gap: '1.1rem',
            paddingBottom: '1.6rem',
          }}
        >
          <MatchingPersonalList
            books={personalBooks}
            bookParticipants={bookParticipants}
            viewingUserId={viewingUserId}
            frozen={isReadOnly}
            mutationUserId={isImpersonating ? viewingUserId : undefined}
          />
        </div>
      </div>

      <MatchingRealtimeWrapper sessionId={activeSession.id} />
    </div>
  )
}

async function fetchScenarioInput(
  participants: { userId: string; pseudonym: string }[],
  minGroupSize: number,
  maxGroupSize: number,
): Promise<GenerateScenariosInput> {
  const participantUserIds = participants.map((p) => p.userId)
  if (participantUserIds.length === 0) {
    return { participants, books: [], signups: [], ranks: [], minGroupSize, maxGroupSize, maxResults: 10 }
  }
  const [allSignups, allRanks, allBooks] = await Promise.all([
    db
      .select({ userId: signupBooks.userId, bookId: signupBooks.bookId, personalStatus: signupBooks.personalStatus })
      .from(signupBooks)
      .where(inArray(signupBooks.userId, participantUserIds)),
    db
      .select({
        userId: bookPriorities.userId,
        bookId: bookPriorities.bookId,
        rank: bookPriorities.rank,
      })
      .from(bookPriorities)
      .where(inArray(bookPriorities.userId, participantUserIds)),
    db
      .select({ id: books.id })
      .from(books)
      .where(eq(books.visibility, 'published')),
  ])

  // Only include books signed up by at least one session participant
  const signedUpBookIds = new Set(allSignups.map((s) => s.bookId))
  const sessionBooks = allBooks
    .filter((b) => signedUpBookIds.has(b.id))
    .map((b) => ({ bookId: b.id }))

  // Exclude signups where the user has set a personal status (reading/read) —
  // they are no longer available as candidates for a new group on that book.
  const activeSignups = allSignups.filter((s) => s.personalStatus === null)

  return {
    participants,
    books: sessionBooks,
    signups: activeSignups.map((s) => ({ userId: s.userId, bookId: s.bookId })),
    ranks: allRanks.map((r) => ({ userId: r.userId, bookId: r.bookId, rank: r.rank })),
    minGroupSize,
    maxGroupSize,
    maxResults: 10,
  }
}

function addMoveImpacts(
  moves: MyMoveBook[],
  scenarioInput: GenerateScenariosInput,
  viewingUserId: string,
  bookTitleById: Map<string, string>,
  currentLeader: MatchingScenario | null,
): MyMoveBook[] {
  return sortMovesByImpact(moves.flatMap((move) => {
    const hasSignup = scenarioInput.signups.some((signup) => (
      signup.userId === viewingUserId && signup.bookId === move.bookId
    ))
    const hasBook = scenarioInput.books.some((book) => book.bookId === move.bookId)
    const nextOverview = generateScenarioSets({
      ...scenarioInput,
      books: hasBook ? scenarioInput.books : [...scenarioInput.books, { bookId: move.bookId }],
      signups: hasSignup
        ? scenarioInput.signups
        : [...scenarioInput.signups, { userId: viewingUserId, bookId: move.bookId }],
      ranks: promoteBookToFirstRank(scenarioInput.ranks, viewingUserId, move.bookId),
    })
    const scenario = nextOverview.leader

    if (!scenario || scenario.id === currentLeader?.id) return []
    if (!scenarioIncludesMove(scenario, viewingUserId, move.bookId)) return []

    const impact = buildMoveImpact({
      move,
      scenario,
      currentLeader,
      viewingUserId,
      bookTitleById,
    })
    if (!impact) return []

    return {
      ...move,
      impact,
    }
  }))
}

function scenarioIncludesMove(
  scenario: MatchingScenario,
  viewingUserId: string,
  bookId: string,
): boolean {
  return scenario.circles.some((circle) => (
      circle.bookId === bookId && circle.members.some((member) => member.userId === viewingUserId)
  ))
}

function promoteBookToFirstRank(
  ranks: GenerateScenariosInput['ranks'],
  userId: string,
  bookId: string,
): GenerateScenariosInput['ranks'] {
  const existingUserRanks = ranks
    .filter((rank) => rank.userId === userId && rank.bookId !== bookId)
    .sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER))
  const otherRanks = ranks.filter((rank) => rank.userId !== userId)

  return [
    ...otherRanks,
    { userId, bookId, rank: 1 },
    ...existingUserRanks.map((rank, index) => ({
      ...rank,
      rank: index + 2,
    })),
  ]
}
