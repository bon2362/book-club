import { auth } from '@/lib/auth'
import { fetchBooksWithCovers } from '@/lib/books'
import { getAllSignups } from '@/lib/signup-books'
import { db } from '@/lib/db'
import { tagDescriptions, users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import BooksPage from '@/components/nd/BooksPage'
import GoogleOneTap from '@/components/nd/GoogleOneTap'
import { DEFAULT_HEADER, DEFAULT_SECTIONS, getIntroData } from '@/lib/intro'

export const dynamic = 'force-dynamic'

export default async function Home() {
  const [session, books, signups, tagDescs, intro] = await Promise.all([
    auth(),
    fetchBooksWithCovers(),
    getAllSignups().catch(() => []),
    db.select().from(tagDescriptions).catch(() => []),
    getIntroData({ onlyPublished: true }).catch(() => ({ header: null, sections: [] })),
  ])

  const introHeader = intro.header ?? { title: DEFAULT_HEADER.title, body: DEFAULT_HEADER.body }
  const introSections = intro.sections.length > 0
    ? intro.sections.map(s => ({ id: s.id, title: s.title, body: s.body }))
    : DEFAULT_SECTIONS.map((s, idx) => ({ id: `default-${idx}`, title: s.title, body: s.body }))

  const booksWithStatus = books

  const signupUser = session?.user?.id
    ? signups.find(s => s.userId === session.user!.id) ?? null
    : null
  const dbUserRows = !signupUser && session?.user?.id
    ? await db
      .select({ name: users.name, contactEmail: users.contactEmail, contacts: users.contacts })
      .from(users)
      .where(eq(users.id, session.user.id))
      .limit(1)
      .catch(() => [])
    : []
  const dbUser = dbUserRows[0]
  const currentUser = signupUser ?? (dbUser?.contacts ? {
    timestamp: '',
    userId: session!.user!.id!,
    name: dbUser.name ?? session?.user?.name ?? '',
    email: dbUser.contactEmail,
    contactEmail: dbUser.contactEmail,
    contacts: dbUser.contacts,
    selectedBooks: [],
    selectedBookIds: [],
  } : null)

  const tagDescMap = Object.fromEntries(tagDescs.map(d => [d.tag, d.description]))

  return (
    <>
      {!session && <GoogleOneTap />}
      <BooksPage books={booksWithStatus} currentUser={currentUser} tagDescriptions={tagDescMap} introHeader={{ title: introHeader.title, body: introHeader.body }} introSections={introSections} />
    </>
  )
}
