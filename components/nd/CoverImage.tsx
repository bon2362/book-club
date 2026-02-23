function getInitials(author: string): string {
  return author
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0]?.toUpperCase() ?? '')
    .join('')
}

interface Props {
  coverUrl: string | null
  title: string
  author: string
}

export default function CoverImage({ coverUrl, title, author }: Props) {
  if (coverUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={coverUrl}
        alt={`Обложка: ${title}`}
        style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
      />
    )
  }

  return (
    <div
      aria-label={`Обложка: ${title}`}
      style={{
        width: '100%',
        height: '100%',
        background: '#F5F5F5',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--nd-sans), system-ui, sans-serif',
          fontSize: '1.5rem',
          color: '#999',
          userSelect: 'none',
        }}
      >
        {getInitials(author)}
      </span>
    </div>
  )
}
