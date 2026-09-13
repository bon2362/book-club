import { redirect } from 'next/navigation'; import { auth } from '@/lib/auth'; import CollectionEditorPage from '@/components/nd/CollectionEditorPage'
export const dynamic='force-dynamic'; export default async function Page(){const s=await auth();if(!s?.user?.id)redirect('/collections?create=1');return <CollectionEditorPage isAdmin={Boolean(s.user.isAdmin)} initial={null} initialBooks={[]}/>}
