import { redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import CollectionEditorPage from '@/components/nd/CollectionEditorPage'

export const dynamic = 'force-dynamic'

export default async function NewCollectionPage() {
  const session = await auth()
  // Гостя ведём на список: там откроется окно входа и сохранится намерение собрать подборку.
  if (!session?.user?.id) redirect('/collections?create=1')
  return <CollectionEditorPage isAdmin={Boolean(session.user.isAdmin)} initial={null} initialBooks={[]} />
}
