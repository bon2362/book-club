import { notFound, redirect } from 'next/navigation'
import { auth } from '@/lib/auth'
import { fetchBookById } from '@/lib/books'
import { getActiveSummaryRevision, getAuthorSummaryById } from '@/lib/book-summaries'
import SummaryEditor from '@/components/nd/SummaryEditor'

export const dynamic = 'force-dynamic'

export default async function EditSummaryPage({ params }: { params: { id: string } }) {
  const session = await auth()
  if (!session?.user?.id) redirect('/')

  const summary = await getAuthorSummaryById(params.id, session.user.id)
  if (!summary) notFound()

  const book = await fetchBookById(summary.bookId)
  if (!book) notFound()
  const revision = summary.status === 'published'
    ? await getActiveSummaryRevision(summary.id)
    : null

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
      initialRevision={revision ? {
        id: revision.id,
        summaryId: revision.summaryId,
        displayName: revision.displayName,
        title: revision.title,
        tldr: revision.tldr,
        bodyMarkdown: revision.bodyMarkdown,
        status: revision.status,
        rejectionReason: revision.rejectionReason,
      } : null}
      bookTitle={book.name}
      bookAuthor={book.author}
    />
  )
}
