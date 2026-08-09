export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth'
import CalendarClient from '@/components/nd/CalendarClient'
import { fetchCalendarPublicState, CalendarStateError, isMissingCalendarSchemaError, migrationRequiredState } from '@/lib/calendar/public-state'

export default async function CalendarPage({
  params,
  searchParams,
}: {
  params: { slug: string }
  searchParams: { as?: string }
}) {
  const session = await auth()
  try {
    const state = await fetchCalendarPublicState({
      slug: params.slug,
      viewerUserId: session?.user?.id ?? null,
      requestedUserId: searchParams.as ?? null,
      isAdmin: Boolean(session?.user?.isAdmin),
    })
    return <CalendarClient initialState={state} actingUserId={searchParams.as} />
  } catch (error) {
    if (isMissingCalendarSchemaError(error)) return <CalendarClient initialState={migrationRequiredState(params.slug)} />
    if (error instanceof CalendarStateError && error.code === 'schedule_not_found') {
      return (
        <main style={{ maxWidth: 720, margin: '0 auto', padding: '48px 24px', color: 'var(--text)', background: 'var(--bg)', minHeight: '100svh' }}>
          <h1 style={{ fontFamily: 'var(--nd-serif)', fontSize: '1.8rem', fontWeight: 400 }}>Календарь не найден</h1>
          <p style={{ color: 'var(--text-secondary)' }}>Проверьте ссылку или откройте календарь из карточки круга на странице матчинга.</p>
        </main>
      )
    }
    throw error
  }
}
