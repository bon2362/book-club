export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'
import { db } from '@/lib/db'
import { matchingSessions, matchingSessionParticipants, users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { fetchPersonalList } from '@/lib/matching/personal-list'
import MatchingPersonalList from '@/components/nd/MatchingPersonalList'

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

export default async function MatchingPage() {
  const session = await auth()
  if (!session?.user?.isAdmin) redirect('/')

  // Load active session
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

  // Load participants and personal list in parallel
  const [participants, personalBooks] = await Promise.all([
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
    fetchPersonalList(session.user.id!),
  ])

  const isAdmin = session.user.isAdmin

  return (
    <main style={{ fontFamily: 'var(--nd-mono), monospace', padding: '2rem', maxWidth: 720, margin: '0 auto' }}>
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
          <span style={{ color: '#4a7' }}>● активна</span>
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
                    background: '#f3f3f3',
                    padding: '2px 8px',
                    borderRadius: 3,
                    fontWeight: 500,
                  }}
                >
                  {p.pseudonym}
                </span>
                {isAdmin && p.name && (
                  <span style={{ color: '#999', fontSize: '0.75rem' }}>
                    {p.name}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section style={{ marginTop: '2rem' }}>
        <h2 style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.75rem' }}>
          Мой список
        </h2>
        <MatchingPersonalList books={personalBooks} />
      </section>

      {isAdmin && (
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
