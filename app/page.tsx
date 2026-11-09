import { Suspense } from 'react'
import { cookies } from 'next/headers'
import { auth } from '@/lib/auth'
import { getSignupForUser } from '@/lib/signup-books'
import { db } from '@/lib/db'
import { users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import BooksPage from '@/components/nd/BooksPage'
import SiteVisitTracker from '@/components/nd/SiteVisitTracker'
import AuthErrorBanner from '@/components/nd/AuthErrorBanner'
import { DEFAULT_HEADER, DEFAULT_SECTIONS } from '@/lib/intro'
import { resolveMatchingStripSessionId } from '@/lib/matching/strip-visibility'
import {
  getCachedHomeBooks,
  getCachedHomeCollectionsEnabled,
  getCachedOpenMatchingSessionId,
  getCachedPublishedCollections,
  getCachedPublishedIntro,
  getCachedTagDescriptions,
} from '@/lib/cache/home-public-data'

export const dynamic = 'force-dynamic'

// Общие данные главной берутся из кэша (lib/cache/home-public-data.ts), поэтому
// анонимный заход — а это в основном боты — не обращается к базе. К базе идут
// только запросы залогиненного пользователя. Подробности: docs/features/home-cache.md.
export default async function Home() {
  const cookieStore = await cookies()
  const session = await auth()
  const userId = session?.user?.id
  const [books, signupUser, tagDescMap, intro, openSessionId, homeBlockEnabled] = await Promise.all([
    getCachedHomeBooks(),
    userId ? getSignupForUser(userId).catch(() => null) : Promise.resolve(null),
    getCachedTagDescriptions().catch(() => ({})),
    getCachedPublishedIntro().catch(() => ({ header: null, sections: [] })),
    getCachedOpenMatchingSessionId().catch(() => null),
    getCachedHomeCollectionsEnabled().catch(() => false),
  ])

  const homeCollections = homeBlockEnabled
    ? await getCachedPublishedCollections().catch(() => [])
    : null

  const introHeader = intro.header ?? { title: DEFAULT_HEADER.title, body: DEFAULT_HEADER.body }
  const introSections = intro.sections.length > 0
    ? intro.sections.map(s => ({ id: s.id, title: s.title, body: s.body }))
    : DEFAULT_SECTIONS.map((s, idx) => ({ id: `default-${idx}`, title: s.title, body: s.body }))

  const booksWithStatus = books

  const dbUserRows = !signupUser && userId
    ? await db
      .select({ name: users.name, contactEmail: users.contactEmail, contacts: users.contacts })
      .from(users)
      .where(eq(users.id, userId))
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
    signups: [],
  } : null)

  // Читаем UI-настройки из cookie на сервере, чтобы первый кадр уже был
  // в нужном состоянии и не дёргался после гидратации (CLS).
  const initialAboutVisible = cookieStore.get('about_dismissed')?.value !== 'true'
  const initialViewMode = cookieStore.get('book_view_mode')?.value === 'list' ? 'list' : 'grid'
  const initialShowRead = cookieStore.get('show_read')?.value === 'true'
  const matchingStripSessionId = resolveMatchingStripSessionId({
    viewerUserId: session?.user?.id,
    openSessionId,
    dismissedSessionId: cookieStore.get('matching_strip_dismissed')?.value ?? null,
  })

  return (
    <>
      {session?.user?.id && <SiteVisitTracker />}
      <Suspense fallback={null}><AuthErrorBanner /></Suspense>
      <BooksPage books={booksWithStatus} currentUser={currentUser} tagDescriptions={tagDescMap} introHeader={{ title: introHeader.title, body: introHeader.body }} introSections={introSections} initialAboutVisible={initialAboutVisible} initialViewMode={initialViewMode} initialShowRead={initialShowRead} matchingStripSessionId={matchingStripSessionId} homeCollections={homeCollections} />
    </>
  )
}
