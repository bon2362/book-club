import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { loadCollectionById, loadEditorBooks, serializeCollection } from '@/lib/collections/repo'
import { isCollectionOwner } from '@/lib/collections/rules'
import { viewerFromSession } from '@/lib/collections/http'
import CollectionEditorPage from '@/components/nd/CollectionEditorPage'

export const dynamic = 'force-dynamic'

// Сегмент называется как у страницы подборки: Next.js не допускает разные имена
// динамического сегмента на одном уровне. Редактор принимает только id.
export default async function EditCollectionPage({ params }: { params: { slugOrId: string } }) {
  const session = await auth()
  if (!session?.user?.id) redirect(`/collections/${params.slugOrId}`)

  const record = await loadCollectionById(params.slugOrId).catch(() => null)
  if (!record) notFound()

  const viewer = viewerFromSession(session)
  if (!isCollectionOwner(record, viewer)) {
    // Владелец сайта правит чужие подборки в модерации — там же разница и действия.
    if (viewer.isAdmin) redirect(`/admin?tab=collections&collection=${record.id}`)
    notFound()
  }

  const books = await loadEditorBooks(record.bookIds)
  return <CollectionEditorPage isAdmin={viewer.isAdmin} initial={serializeCollection(record)} initialBooks={books} />
}
