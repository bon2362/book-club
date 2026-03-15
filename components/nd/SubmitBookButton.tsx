'use client'

interface Props {
  onClick: () => void
}

export default function SubmitBookButton({ onClick }: Props) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: 'var(--nd-sans), system-ui, sans-serif',
        fontSize: '0.65rem',
        textTransform: 'uppercase',
        letterSpacing: '0.08em',
        color: '#C0603A',
        background: 'none',
        border: 'none',
        borderBottom: '1px solid #C0603A',
        cursor: 'pointer',
        padding: '0 0 1px',
        whiteSpace: 'nowrap',
      }}
    >
      Предложить книгу
    </button>
  )
}
