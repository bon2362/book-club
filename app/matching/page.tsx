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
import MatchingScenarios from '@/components/nd/MatchingScenarios'
import MatchingMyMoves from '@/components/nd/MatchingMyMoves'
import MatchingRankNudge from '@/components/nd/MatchingRankNudge'

function DeadlineCountdown({ deadlineAt }: { deadlineAt: Date }) {
  const now = Date.now()
  const delta = deadlineAt.getTime() - now
  if (delta <= 0) return <span style={{ color: '#c00' }}>Дедлайн истёк</span>
  const days = Math.floor(delta / 86_400_000)
  const hours = Math.floor((delta % 86_400_000) / 3_600_000)
  const minutes = Math.floor((delta % 3_600_000) / 60_000)
  if (days > 0) return <span>{days} д {hours} ч</span>
  if (hours > 0) return <span>{hours} ч {minutes} мин</span>
  return <span>{minutes} мин</span>
}

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
      <main style={{ fontFamily: 'var(--nd-mono), monospace', padding: '2rem', maxWidth: 720, margin: '0 auto' }}>
        <h1 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '1rem' }}>Матчинг</h1>
        <p style={{ color: '#999' }}>Нет активной сессии. Создайте её в <a href="/admin?tab=matching" style={{ color: '#333' }}>Админ-панели → Матчинг</a>.</p>
      </main>
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
    fetchPersonalList(viewingUserId),
    fetchMyMoves(viewingUserId, activeSession.id, activeSession.targetGroupSize),
  ])

  const participantUserIds = participants.map(p => p.userId)
  const viewedParticipant = isImpersonating
    ? participants.find(p => p.userId === asParam)
    : null

  // Fetch scenario data only when enough participants
  const scenarios =
    participantUserIds.length >= activeSession.targetGroupSize
      ? await fetchAndGenerateScenarios(participantUserIds, activeSession.targetGroupSize)
      : []

  // Fetch book details for scenario cards
  const scenarioBookIds = Array.from(new Set(scenarios.map(s => s.bookId)))
  const scenarioBooks =
    scenarioBookIds.length > 0
      ? await db.select({ id: books.id, title: books.title, author: books.author, coverUrl: books.coverUrl })
          .from(books)
          .where(inArray(books.id, scenarioBookIds))
      : []
  const bookById = new Map(scenarioBooks.map(b => [b.id, b]))

  // When impersonating, list and moves are read-only
  const isFrozenOrImpersonating = activeSession.status === 'frozen' || isImpersonating

  return (
    <main style={{ fontFamily: 'var(--nd-mono), monospace', padding: '2rem', maxWidth: 720, margin: '0 auto' }}>
      {isImpersonating && (
        <div
          data-testid="admin-impersonation-banner"
          role="status"
          style={{
            background: '#fffbea',
            border: '1px solid #f0d060',
            borderRadius: 4,
            padding: '0.6rem 1rem',
            marginBottom: '1.5rem',
            fontSize: '0.8rem',
            color: '#7a5c00',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <span>👁 Просмотр за</span>
          <strong>{viewedParticipant?.pseudonym ?? asParam}</strong>
          {viewedParticipant?.name && (
            <span style={{ color: '#a07800' }}>({viewedParticipant.name})</span>
          )}
          <span style={{ marginLeft: 'auto', opacity: 0.7 }}>только чтение</span>
          <a
            href="/matching"
            style={{ color: '#7a5c00', textDecoration: 'underline', fontSize: '0.75rem' }}
          >
            ← вернуться к своему виду
          </a>
        </div>
      )}

      <header style={{ marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: '0.25rem' }}>
          {activeSession.name}
        </h1>
        <div style={{ fontSize: '0.78rem', color: '#666', display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
          <span>Группы по {activeSession.targetGroupSize}</span>
          {activeSession.deadlineAt && (
            <span>
              Дедлайн: <DeadlineCountdown deadlineAt={new Date(activeSession.deadlineAt)} />
            </span>
          )}
          {activeSession.status === 'frozen' ? (
            <span style={{ color: '#888', background: '#f0f0f0', padding: '1px 8px', borderRadius: 3, fontSize: '0.72rem' }}>
              Зафиксирована
            </span>
          ) : (
            <span style={{ color: '#4a7' }}>● активна</span>
          )}
        </div>
      </header>

      <section>
        <h2 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem' }}>
          Участники ({participants.length})
        </h2>
        {participants.length === 0 ? (
          <p style={{ color: '#999', fontSize: '0.8rem' }}>Пока никто не присоединился.</p>
        ) : (
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            {participants.map(p => (
              <li
                key={p.userId}
                style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.82rem' }}
              >
                <span
                  style={{
                    background: isImpersonating && p.userId === asParam ? '#fffbea' : '#f3f3f3',
                    border: isImpersonating && p.userId === asParam ? '1px solid #f0d060' : '1px solid transparent',
                    padding: '2px 8px',
                    borderRadius: 3,
                    fontWeight: 500,
                  }}
                >
                  {p.pseudonym}
                </span>
                {isAdmin && p.name && (
                  <a
                    href={`/matching?as=${p.userId}`}
                    style={{ color: '#999', fontSize: '0.75rem', textDecoration: 'none' }}
                    title="Посмотреть за этого участника"
                  >
                    {p.name}
                  </a>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem' }}>
          {isImpersonating ? `Список участника` : `Мой список`}
        </h2>
        {!isImpersonating && (
          <MatchingRankNudge
            show={personalBooks.length > 0 && personalBooks.every(b => b.rank === null)}
          />
        )}
        <MatchingPersonalList
          books={personalBooks}
          frozen={isFrozenOrImpersonating}
        />
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem' }}>
          {isImpersonating ? `Ходы участника` : `Мои ходы`}
        </h2>
        <MatchingMyMoves moves={myMoves} />
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem' }}>
          Сценарии групп
        </h2>
        <MatchingScenarios scenarios={scenarios} bookById={bookById} />
      </section>

      {isAdmin && !isImpersonating && (
        <section style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid #eee' }}>
          <h2 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Управление</h2>
          <a href="/admin?tab=matching" style={{ fontSize: '0.78rem', color: '#333', textDecoration: 'underline' }}>
            Перейти в Админ-панель → Матчинг
          </a>
        </section>
      )}
    </main>
  )
}

async function fetchAndGenerateScenarios(participantUserIds: string[], targetGroupSize: number) {
  const [allSignups, allRanks, allBooks] = await Promise.all([
    db.select({ userId: signupBooks.userId, bookId: signupBooks.bookId })
      .from(signupBooks)
      .where(inArray(signupBooks.userId, participantUserIds)),
    db.select({ userId: bookPriorities.userId, bookId: bookPriorities.bookId, rank: bookPriorities.rank })
      .from(bookPriorities)
      .where(inArray(bookPriorities.userId, participantUserIds)),
    db.select({ id: books.id, readingStatus: books.readingStatus })
      .from(books)
      .where(and(eq(books.visibility, 'published'))),
  ])

  // Only include books that are signed up by at least one session participant
  const signedUpBookIds = new Set(allSignups.map(s => s.bookId))
  const sessionBooks = allBooks
    .filter(b => signedUpBookIds.has(b.id))
    .map(b => ({ bookId: b.id, readingStatus: b.readingStatus ?? null }))

  // Build participant list from userIds (pseudonyms not needed for engine)
  const scenarioParticipants = participantUserIds.map(userId => ({ userId, pseudonym: userId }))

  return generateScenarios({
    participants: scenarioParticipants,
    books: sessionBooks,
    signups: allSignups.map(s => ({ userId: s.userId, bookId: s.bookId })),
    ranks: allRanks.map(r => ({ userId: r.userId, bookId: r.bookId, rank: r.rank })),
    targetGroupSize,
    maxResults: 10,
  })
}
