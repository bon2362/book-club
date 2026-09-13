import { auth } from '@/lib/auth'
import { listPublishedCollections } from '@/lib/collections/repo'
import { isMissingCollectionsSchemaError } from '@/lib/collections/errors'
import CollectionsIndex from '@/components/nd/CollectionsIndex'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Подборки — Долгое наступление' }

export default async function CollectionsPage({ searchParams }: { searchParams: { create?: string } }) {
  const [session, collections] = await Promise.all([
    auth(),
    listPublishedCollections().catch((error) => {
      if (isMissingCollectionsSchemaError(error)) return []
      throw error
    }),
  ])

  return (
    <CollectionsIndex
      collections={collections}
      isLoggedIn={Boolean(session?.user?.id)}
      isAdmin={Boolean(session?.user?.isAdmin)}
      openCreate={searchParams.create === '1'}
    />
  )
}
