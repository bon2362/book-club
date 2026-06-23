import { notFound } from 'next/navigation'
import { fetchBookById } from '@/lib/books'
import { getPublishedSummariesForBook } from '@/lib/book-summaries'
import SummaryMarkdown from '@/components/nd/SummaryMarkdown'

export const dynamic = 'force-dynamic'

function formatDate(date: Date | null): string {
  if (!date) return ''
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(date)
}

export default async function BookSummariesPage({ params }: { params: { bookId: string } }) {
  const [book, summaries] = await Promise.all([
    fetchBookById(params.bookId),
    getPublishedSummariesForBook(params.bookId),
  ])

  if (!book || summaries.length === 0) notFound()

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

        <div style={{ display: 'grid', gap: '2.5rem' }}>
          {summaries.map((summary, index) => (
            <article key={summary.id} id={summary.id} style={{ borderBottom: index === summaries.length - 1 ? 'none' : '1px solid var(--border)', paddingBottom: '2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.8rem', flexWrap: 'wrap' }}>
                <div style={{ fontFamily: 'var(--nd-sans)', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
                  <strong style={{ color: 'var(--text)' }}>{summary.displayName}</strong>
                  {summary.publishedAt ? ` · ${formatDate(summary.publishedAt)}` : ''}
                </div>
                {summaries.length > 1 && (
                  <span style={{ fontFamily: 'var(--nd-sans)', fontSize: '0.65rem', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
                    {index + 1} / {summaries.length}
                  </span>
                )}
              </div>
              <h2 style={{ fontFamily: 'var(--nd-serif)', fontSize: '1.55rem', lineHeight: 1.18, margin: '0 0 1rem' }}>{summary.title}</h2>
              <section style={{ margin: '0 0 1.4rem', padding: '1rem', borderLeft: '2px solid var(--accent)', background: 'var(--bg-tint)' }}>
                <div style={{ fontFamily: 'var(--nd-sans)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--accent)', marginBottom: '0.4rem' }}>В двух словах</div>
                <p style={{ margin: 0, fontFamily: 'var(--nd-serif)', lineHeight: 1.6 }}>{summary.tldr}</p>
              </section>
              <SummaryMarkdown markdown={summary.bodyMarkdown} />
            </article>
          ))}
        </div>
      </div>
    </main>
  )
}
