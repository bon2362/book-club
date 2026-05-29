export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { matchingSessions, matchingSessionParticipants, users, signupBooks, bookPriorities, books } from '@/lib/db/schema'
import { eq, inArray, and } from 'drizzle-orm'
import { fetchPersonalList } from '@/lib/matching/personal-list'
import { generateScenarios } from '@/lib/matching/scenarios'
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
      <main className="font-mono p-8 max-w-2xl mx-auto">
        <h1 className="text-lg font-semibold mb-4">Матчинг</h1>
        <p className="text-[#999]">
          Нет активной сессии. Создайте её в{' '}
          <a href="/admin?tab=matching" className="text-[#333] underline">
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
    fetchPersonalList(viewingUserId),
    fetchMyMoves(viewingUserId, activeSession.id, activeSession.targetGroupSize),
  ])

  const participantUserIds = participants.map((p) => p.userId)
  const viewedParticipant = isImpersonating
    ? participants.find((p) => p.userId === asParam)
    : null

  // Fetch per-book participant signups for chips in the personal list
  const bookParticipants: BookParticipant[] =
    personalBooks.length > 0 && participantUserIds.length > 0
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
          .where(
            and(
              inArray(signupBooks.bookId, personalBooks.map((b) => b.bookId)),
              inArray(signupBooks.userId, participantUserIds),
            ),
          )
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
  const scenarios =
    participantUserIds.length >= activeSession.targetGroupSize
      ? await fetchAndGenerateScenarios(participantUserIds, activeSession.targetGroupSize)
      : []

  // Fetch book details for scenario cards
  const scenarioBookIds = Array.from(new Set(scenarios.map((s) => s.bookId)))
  const scenarioBooks =
    scenarioBookIds.length > 0
      ? await db
          .select({ id: books.id, title: books.title, author: books.author, coverUrl: books.coverUrl })
          .from(books)
          .where(inArray(books.id, scenarioBookIds))
      : []
  const bookById = new Map(scenarioBooks.map((b) => [b.id, b]))

  // Frozen or impersonating = read-only
  const isFrozenOrImpersonating = activeSession.status === 'frozen' || isImpersonating

  return (
    <div className="flex flex-col bg-[#f6f2e8]" style={{ height: '100svh', overflow: 'hidden' }}>
      <MatchingHeader
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
      />

      {/* Two-column workspace */}
      <div
        className="flex-1 min-h-0 p-4 gap-4 grid"
        style={{ gridTemplateColumns: 'minmax(0, 1.4fr) minmax(0, 1fr)' }}
      >
        {/* Left: personal book list */}
        <div className="flex flex-col bg-[#fffdf8] border border-[#ded6c8] rounded-xl shadow-[0_4px_24px_rgba(25,24,23,0.08)] overflow-hidden min-h-0">
          <div className="px-4 py-3 border-b border-[#ded6c8] shrink-0">
            <h2 className="text-base font-semibold m-0 text-[#191817]">
              {isImpersonating ? 'Список участника' : 'Мой список'}
            </h2>
            {!isImpersonating && (
              <p className="text-xs text-[#6d675f] mt-0.5 m-0">
                Перетащи книги, чтобы расставить приоритеты
              </p>
            )}
          </div>
          {!isImpersonating && (
            <MatchingRankNudge
              show={personalBooks.length > 0 && personalBooks.every((b) => b.rank === null)}
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
          {isAdmin && !isImpersonating && (
            <div className="px-4 py-2.5 border-t border-[#ded6c8] shrink-0">
              <a
                href="/admin?tab=matching"
                className="text-xs text-[#6d675f] underline hover:text-[#191817]"
              >
                Перейти в Админ-панель → Матчинг
              </a>
            </div>
          )}
        </div>

        {/* Right column: scenarios + moves stacked */}
        <div className="flex flex-col gap-4 min-h-0 overflow-hidden">
          {/* Scenarios */}
          <div className="flex flex-col flex-1 bg-[#fffdf8] border border-[#ded6c8] rounded-xl shadow-[0_4px_24px_rgba(25,24,23,0.08)] overflow-hidden min-h-0">
            <div className="px-4 py-3 border-b border-[#ded6c8] shrink-0">
              <h2
                className="text-base font-semibold m-0 text-[#191817]"
                title="Сортировка: макс. участников → больше топ-3 книг → ниже средний ранг"
              >
                Сценарии групп
              </h2>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto p-3">
              <MatchingScenarios scenarios={scenarios} bookById={bookById} />
            </div>
          </div>

          {/* My moves */}
          <div className="flex flex-col flex-1 bg-[#fffdf8] border border-[#ded6c8] rounded-xl shadow-[0_4px_24px_rgba(25,24,23,0.08)] overflow-hidden min-h-0">
            <div className="px-4 py-3 border-b border-[#ded6c8] shrink-0">
              <h2 className="text-base font-semibold m-0 text-[#191817]">
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

async function fetchAndGenerateScenarios(
  participantUserIds: string[],
  targetGroupSize: number,
) {
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

  const scenarioParticipants = participantUserIds.map((userId) => ({ userId, pseudonym: userId }))

  return generateScenarios({
    participants: scenarioParticipants,
    books: sessionBooks,
    signups: activeSignups.map((s) => ({ userId: s.userId, bookId: s.bookId })),
    ranks: allRanks.map((r) => ({ userId: r.userId, bookId: r.bookId, rank: r.rank })),
    targetGroupSize,
    maxResults: 10,
  })
}
