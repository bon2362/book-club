'use client'

interface Props {
  onFeedback: () => void
}

export default function Footer({ onFeedback }: Props) {
  return (
    <footer
      style={{
        borderTop: '2px solid #000',
        background: '#fff',
      }}
    >
      <div
        style={{
          maxWidth: '1200px',
          margin: '0 auto',
          padding: '0.75rem 1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'flex-end',
        }}
      >
        <button
          onClick={onFeedback}
          style={{
            fontFamily: 'var(--nd-sans), system-ui, sans-serif',
            fontSize: '0.65rem',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            color: '#666',
            background: 'none',
            border: 'none',
            borderBottom: '1px solid #bbb',
            cursor: 'pointer',
            padding: '0 0 1px',
          }}
        >
          Написать автору проекта
        </button>
      </div>
    </footer>
  )
}
