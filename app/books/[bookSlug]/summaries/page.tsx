import type { Metadata } from 'next'
import { notFound, redirect } from 'next/navigation'
import { fetchBookById, fetchBookBySlug } from '@/lib/books'
import { getPublishedSummariesForBook } from '@/lib/book-summaries'
import SummaryAuthorSwitcher from '@/components/nd/SummaryAuthorSwitcher'
import SummaryArticle from '@/components/nd/SummaryArticle'
import { buildAuthorSlugs, estimateReadingMinutes, selectSummaryIndex } from '@/lib/summary-view'

export const dynamic = 'force-dynamic'

async function resolveBookReference(bookReference: string) {
  const slugBook = await fetchBookBySlug(bookReference)
  return {
    slugBook,
    book: slugBook ?? await fetchBookById(bookReference),
  }
}

export async function generateMetadata({ params }: { params: { bookSlug: string } }): Promise<Metadata> {
  const { book } = await resolveBookReference(params.bookSlug)
  if (!book) return {}
  return {
    alternates: {
      canonical: `/books/${book.slug ?? book.id}/summaries`,
    },
  }
}

export default async function BookSummariesPage({
  params,
  searchParams,
}: {
  params: { bookSlug: string }
  searchParams: { author?: string }
}) {
  const { slugBook, book } = await resolveBookReference(params.bookSlug)
  if (!book) notFound()
  if (!slugBook && book.slug) redirect(`/books/${book.slug}/summaries`)

  const summaries = await getPublishedSummariesForBook(book.id)
  if (summaries.length === 0) notFound()

  const slugs = buildAuthorSlugs(summaries)
  const activeIndex = selectSummaryIndex(slugs, searchParams.author)
  const active = summaries[activeIndex]
  const basePath = `/books/${book.slug ?? book.id}/summaries`
  const writeHref = `/books/${book.slug ?? book.id}/my-summary/edit`
  const authors = summaries.map((summary, index) => ({ slug: slugs[index], displayName: summary.displayName }))

  return (
    <main style={{ minHeight: '100vh', background: 'var(--bg)', color: 'var(--text)' }}>
      <div style={{ maxWidth: 760, margin: '0 auto', padding: '2.5rem 1.5rem 4rem' }}>
        <a href="/" style={{ fontFamily: 'var(--nd-sans)', fontSize: '0.78rem', color: 'var(--text-muted)', textDecoration: 'none' }}>← Каталог</a>
        <header style={{ margin: '1.2rem 0 2rem', borderBottom: '2px solid var(--border-strong)', paddingBottom: '1.2rem' }}>
          <div style={{ fontFamily: 'var(--nd-sans)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--accent)', marginBottom: '0.5rem' }}>Саммари книги</div>
          <h1 style={{ fontFamily: 'var(--nd-serif)', fontSize: '2.25rem', lineHeight: 1.12, margin: 0 }}>{book.name}</h1>
          <p style={{ fontFamily: 'var(--nd-serif)', fontStyle: 'italic', color: 'var(--text-muted)', margin: '0.6rem 0 0' }}>
            {book.author}{book.date ? ` · ${book.date}` : ''}{book.pages ? ` · ${book.pages} стр.` : ''}
          </p>
        </header>

        <SummaryAuthorSwitcher authors={authors} activeSlug={slugs[activeIndex]} basePath={basePath} writeHref={writeHref} />

        <SummaryArticle
          key={active.id}
          displayName={active.displayName}
          title={active.title}
          tldr={active.tldr}
          bodyMarkdown={active.bodyMarkdown}
          publishedAt={active.publishedAt}
          readingMinutes={estimateReadingMinutes(active.bodyMarkdown)}
        />
      </div>
    </main>
  )
}
