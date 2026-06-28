import AuthorAvatar from './AuthorAvatar'
import SummaryMarkdown from './SummaryMarkdown'

interface Props {
  displayName: string
  title: string
  tldr: string
  bodyMarkdown: string
  publishedAt: Date | null
  readingMinutes: number
}

function formatDate(date: Date | null): string {
  if (!date) return ''
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(date)
}

export default function SummaryArticle({ displayName, title, tldr, bodyMarkdown, publishedAt, readingMinutes }: Props) {
  const dateLabel = formatDate(publishedAt)
  return (
    <article>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.7rem', marginBottom: '1rem' }}>
        <AuthorAvatar name={displayName} size={40} />
        <div style={{ fontFamily: 'var(--nd-sans), system-ui, sans-serif', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          <div><strong style={{ color: 'var(--text)' }}>{displayName}</strong> · участница клуба</div>
          <div style={{ color: 'var(--text-muted)' }}>
            {readingMinutes} мин чтения{dateLabel ? ` · опубликовано ${dateLabel}` : ''}
          </div>
        </div>
      </div>
      <h2 style={{ fontFamily: 'var(--nd-serif)', fontSize: '1.55rem', lineHeight: 1.18, margin: '0 0 1rem' }}>{title}</h2>
      <section style={{ margin: '0 0 1.4rem', padding: '1rem', borderLeft: '2px solid var(--accent)', background: 'var(--bg-tint)' }}>
        <div style={{ fontFamily: 'var(--nd-sans)', fontSize: '0.65rem', textTransform: 'uppercase', letterSpacing: '0.14em', color: 'var(--accent)', marginBottom: '0.4rem' }}>В двух словах</div>
        <p style={{ margin: 0, fontFamily: 'var(--nd-serif)', lineHeight: 1.6 }}>{tldr}</p>
      </section>
      <SummaryMarkdown markdown={bodyMarkdown} />
    </article>
  )
}
