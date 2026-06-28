interface Props {
  name: string
  size?: number
}

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return (words[0][0] + words[1][0]).toUpperCase()
}

export default function AuthorAvatar({ name, size = 32 }: Props) {
  return (
    <span
      aria-hidden="true"
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: 'var(--bg-tag)',
        color: 'var(--text)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'var(--nd-sans), system-ui, sans-serif',
        fontSize: Math.round(size * 0.4),
        fontWeight: 600,
        flex: 'none',
      }}
    >
      {initials(name)}
    </span>
  )
}
