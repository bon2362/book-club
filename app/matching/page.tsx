export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { matchingSessions, matchingSessionParticipants, users, signupBooks, bookPriorities, books } from '@/lib/db/schema'
import { eq, inArray, and } from 'drizzle-orm'
import { fetchCatalogWithPersonalData } from '@/lib/matching/personal-list'
import { emptyScenarioOverview, generateScenarioOverview } from '@/lib/matching/scenarios'
import { fetchMyMoves } from '@/lib/matching/my-moves'
import MatchingPersonalList from '@/components/nd/MatchingPersonalList'
import type { BookParticipant } from '@/components/nd/MatchingPersonalList'
import MatchingScenarios from '@/components/nd/MatchingScenarios'
import MatchingMyMoves from '@/components/nd/MatchingMyMoves'
import MatchingRankNudge from '@/components/nd/MatchingRankNudge'
import MatchingRealtimeWrapper from '@/components/nd/MatchingRealtimeWrapper'
import MatchingHeader from '@/components/nd/MatchingHeader'
import { assignPseudonym } from '@/lib/matching/pseudonyms'

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

  // Auto-join: if not impersonating and session is active, ensure user is a participant
  if (!isImpersonating && activeSession.status === 'active') {
    const existing = await db
      .select({ userId: matchingSessionParticipants.userId })
      .from(matchingSessionParticipants)
      .where(
        and(
          eq(matchingSessionParticipants.sessionId, activeSession.id),
          eq(matchingSessionParticipants.userId, session.user.id!),
        ),
      )
      .limit(1)

    if (existing.length === 0) {
      const taken = await db
        .select({ pseudonym: matchingSessionParticipants.pseudonym })
        .from(matchingSessionParticipants)
        .where(eq(matchingSessionParticipants.sessionId, activeSession.id))
      const takenSet = new Set(taken.map((r) => r.pseudonym))
      const pseudonym = assignPseudonym(takenSet)
      await db
        .insert(matchingSessionParticipants)
        .values({
          sessionId: activeSession.id,
          userId: session.user.id!,
          pseudonym,
        })
        .onConflictDoNothing()
    }
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
    fetchMyMoves(viewingUserId, activeSession.id, activeSession.targetGroupSize),
  ])

  const participantUserIds = participants.map((p) => p.userId)
  const viewedParticipant = isImpersonating
    ? participants.find((p) => p.userId === asParam)
    : null

  // Fetch per-book participant signups for chips in the popup (all catalog books, not just user's list)
  const inListBookIds = personalBooks.filter((b) => b.isInList).map((b) => b.bookId)
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

  // Fetch scenario data only when enough participants
  const scenarioOverview =
    participantUserIds.length >= activeSession.targetGroupSize
      ? await fetchAndGenerateScenarioOverview(
          participants.map((p) => ({ userId: p.userId, pseudonym: p.pseudonym })),
          activeSession.targetGroupSize,
        )
      : emptyScenarioOverview(
          participants.map((p) => ({ userId: p.userId, pseudonym: p.pseudonym })),
          activeSession.targetGroupSize,
        )

  // Fetch book details for scenario cards
  const scenarioBookIds = Array.from(
    new Set([
      ...scenarioOverview.current.map((s) => s.bookId),
      ...scenarioOverview.candidates.map((s) => s.bookId),
    ]),
  )
  const scenarioBooks =
    scenarioBookIds.length > 0
      ? await db
          .select({
            id: books.id,
            title: books.title,
            author: books.author,
            description: books.description,
            coverUrl: books.coverUrl,
            pages: books.pages,
            publishedDate: books.publishedDate,
            textUrl: books.textUrl,
            whyRead: books.whyRead,
            recommendationLink: books.recommendationLink,
            tags: books.tags,
          })
          .from(books)
          .where(inArray(books.id, scenarioBookIds))
      : []
  const bookById = new Map(scenarioBooks.map((b) => [b.id, {
    ...b,
    bookId: b.id,
    tags: Array.isArray(b.tags) ? b.tags : [],
  }]))

  // Frozen or impersonating = read-only
  const isFrozenOrImpersonating = activeSession.status === 'frozen' || isImpersonating

  // Get current user's pseudonym (not impersonating) or null if impersonating
  const userPseudonym = !isImpersonating
    ? participants.find((p) => p.userId === session.user.id)?.pseudonym ?? null
    : null

  return (
    <div
      className="flex flex-col"
      style={{ height: '100svh', overflow: 'hidden', background: 'var(--bg-input)', color: 'var(--text)' }}
    >
      <MatchingHeader
        sessionId={activeSession.id}
        sessionName={activeSession.name}
        sessionStatus={activeSession.status}
        targetGroupSize={activeSession.targetGroupSize}
        deadlineAt={activeSession.deadlineAt ? new Date(activeSession.deadlineAt).toISOString() : null}
        participants={participants.map((p) => ({ userId: p.userId, pseudonym: p.pseudonym, name: p.name ?? null }))}
        isAdmin={isAdmin}
        isImpersonating={isImpersonating}
        viewedPseudonym={viewedParticipant?.pseudonym ?? null}
        viewedName={viewedParticipant?.name ?? null}
        asParam={asParam}
        userPseudonym={userPseudonym}
      />

      {/* Two-column workspace */}
      <div
        className="flex-1 min-h-0 p-4 gap-4 grid"
        style={{ gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)' }}
      >
        {/* Left: personal book list */}
        <div
          className="flex flex-col overflow-hidden min-h-0 border"
          style={{
            background: 'var(--bg-input)',
            borderColor: 'var(--border)',
            borderRadius: 0,
          }}
        >
          <div
            className="px-4 py-3 shrink-0 border-b"
            style={{ borderColor: 'var(--border)' }}
          >
            <h2
              className="m-0"
              style={{
                fontFamily: 'system-ui, sans-serif',
                fontSize: '0.62rem',
                fontWeight: 600,
                textTransform: 'uppercase' as const,
                letterSpacing: '0.14em',
                color: 'var(--text-muted)',
              }}
            >
              {isImpersonating ? 'Список участника' : 'Каталог'}
            </h2>
            {!isImpersonating && (
              <p className="text-xs mt-0.5 m-0" style={{ color: 'var(--text-muted)' }}>
                Перетащи книги, чтобы расставить приоритеты
              </p>
            )}
          </div>
          {!isImpersonating && (
            <MatchingRankNudge
              show={inListBookIds.length > 0 && personalBooks.filter((b) => b.isInList).every((b) => b.rank === null)}
            />
          )}
          <div className="flex-1 min-h-0 overflow-y-auto">
            <MatchingPersonalList
              books={personalBooks}
              bookParticipants={bookParticipants}
              viewingUserId={viewingUserId}
              frozen={isFrozenOrImpersonating}
            />
          </div>
        </div>

        {/* Right column: scenarios + moves stacked */}
        <div className="flex flex-col gap-4 min-h-0 overflow-hidden">
          {/* Scenarios */}
          <div
            className="flex flex-col flex-1 overflow-hidden min-h-0 border"
            style={{
              background: 'var(--bg-input)',
              borderColor: 'var(--border)',
              borderRadius: 0,
            }}
          >
            <div
              className="px-4 py-3 shrink-0 border-b"
              style={{ borderColor: 'var(--border)' }}
            >
              <h2
                className="m-0"
                style={{
                  fontFamily: 'system-ui, sans-serif',
                  fontSize: '0.62rem',
                  fontWeight: 600,
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.14em',
                  color: 'var(--text-muted)',
                }}
                title="Сортировка: макс. участников → больше топ-3 книг → ниже средний ранг"
              >
                Читательские круги
              </h2>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-3">
              <MatchingScenarios
                overview={scenarioOverview}
                bookById={bookById}
                bookParticipants={bookParticipants}
                viewingUserId={viewingUserId}
                targetGroupSize={activeSession.targetGroupSize}
              />
            </div>
          </div>

          {/* My moves */}
          <div
            className="flex flex-col flex-1 overflow-hidden min-h-0 border"
            style={{
              background: 'var(--bg-input)',
              borderColor: 'var(--border)',
              borderRadius: 0,
            }}
          >
            <div
              className="px-4 py-3 shrink-0 border-b"
              style={{ borderColor: 'var(--border)' }}
            >
              <h2
                className="m-0"
                style={{
                  fontFamily: 'system-ui, sans-serif',
                  fontSize: '0.62rem',
                  fontWeight: 600,
                  textTransform: 'uppercase' as const,
                  letterSpacing: '0.14em',
                  color: 'var(--text-muted)',
                }}
              >
                {isImpersonating ? 'Ходы участника' : 'Мои ходы'}
              </h2>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-3">
              <MatchingMyMoves moves={myMoves} frozen={isFrozenOrImpersonating} />
            </div>
          </div>
        </div>
      </div>

      <MatchingRealtimeWrapper sessionId={activeSession.id} />
    </div>
  )
}

async function fetchAndGenerateScenarioOverview(
  participants: { userId: string; pseudonym: string }[],
  targetGroupSize: number,
) {
  const participantUserIds = participants.map((p) => p.userId)
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

  return generateScenarioOverview({
    participants,
    books: sessionBooks,
    signups: activeSignups.map((s) => ({ userId: s.userId, bookId: s.bookId })),
    ranks: allRanks.map((r) => ({ userId: r.userId, bookId: r.bookId, rank: r.rank })),
    targetGroupSize,
    maxResults: 10,
  })
}
