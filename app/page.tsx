import { auth } from '@/lib/auth'
import { fetchBooksWithCovers } from '@/lib/books-with-covers'
import { getAllSignups } from '@/lib/signups'
import { db } from '@/lib/db'
import { bookStatuses, tagDescriptions, users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { SessionProvider } from 'next-auth/react'
import BooksPage from '@/components/nd/BooksPage'
import GoogleOneTap from '@/components/nd/GoogleOneTap'
import { DEFAULT_HEADER, DEFAULT_SECTIONS, getIntroData } from '@/lib/intro'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const [session, books, signups, statuses, tagDescs, intro] = await Promise.all([
    auth(),
    fetchBooksWithCovers(),
    getAllSignups().catch(() => []),
    db.select().from(bookStatuses).catch(() => []),
    db.select().from(tagDescriptions).catch(() => []),
    getIntroData({ onlyPublished: true }).catch(() => ({ header: null, sections: [] })),
  ])

  const introHeader = intro.header ?? { title: DEFAULT_HEADER.title, body: DEFAULT_HEADER.body }
  const introSections = intro.sections.length > 0
    ? intro.sections.map(s => ({ id: s.id, title: s.title, body: s.body }))
    : DEFAULT_SECTIONS.map((s, idx) => ({ id: `default-${idx}`, title: s.title, body: s.body }))

  const statusMap = new Map(statuses.map(s => [s.bookId, s.status as 'reading' | 'read']))

  const signupCountByName = new Map<string, number>()
  for (const signup of signups) {
    for (const bookName of signup.selectedBooks) {
      signupCountByName.set(bookName, (signupCountByName.get(bookName) ?? 0) + 1)
    }
  }

  const booksWithStatus = books.map(b => ({
    ...b,
    status: statusMap.get(b.id) ?? null,
    signupCount: signupCountByName.get(b.name) ?? 0,
  }))

  const sheetsUser = session?.user?.email
    ? signups.find(s => s.email === session.user!.email) ?? null
    : null
  const dbUserRows = !sheetsUser && session?.user?.id
    ? await db
      .select({ name: users.name, email: users.email, contacts: users.contacts })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1)
      .catch(() => [])
    : []
  const dbUser = dbUserRows[0]
  const currentUser = sheetsUser ?? (dbUser?.contacts ? {
    timestamp: '',
    userId: dbUser.email,
    name: dbUser.name ?? session?.user?.name ?? '',
    email: dbUser.email,
    contacts: dbUser.contacts,
    selectedBooks: [],
  } : null)

  const tagDescMap = Object.fromEntries(tagDescs.map(d => [d.tag, d.description]))

  return (
    <SessionProvider>
      {!session && <GoogleOneTap />}
      <BooksPage books={booksWithStatus} currentUser={currentUser} tagDescriptions={tagDescMap} introHeader={{ title: introHeader.title, body: introHeader.body }} introSections={introSections} />
    </SessionProvider>
  )
}
