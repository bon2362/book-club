import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { fetchBookById } from '@/lib/books'
import { getAuthorSummaryById } from '@/lib/book-summaries'
import SummaryEditor from '@/components/nd/SummaryEditor'

export const dynamic = 'force-dynamic'

export default async function EditSummaryPage({ params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user?.id) redirect('/')

  const summary = await getAuthorSummaryById(params.id, session.user.id)
  if (!summary) notFound()

  const book = await fetchBookById(summary.bookId)
  if (!book) notFound()

  return (
    <SummaryEditor
      initialSummary={{
        id: summary.id,
        bookId: summary.bookId,
        displayName: summary.displayName,
        title: summary.title,
        tldr: summary.tldr,
        bodyMarkdown: summary.bodyMarkdown,
        status: summary.status,
        rejectionReason: summary.rejectionReason,
      }}
      bookTitle={book.name}
      bookAuthor={book.author}
    />
  )
}
