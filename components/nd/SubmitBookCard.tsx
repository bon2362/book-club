'use client'

import { useState } from 'react'

interface Props {
  onClick: () => void
}

export default function SubmitBookCard({ onClick }: Props) {
  const [hovered, setHovered] = useState(false)

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      aria-label="Предложить книгу"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '0.75rem',
        width: '100%',
        minHeight: '200px',
        background: hovered ? '#FEF8F5' : '#fff',
        border: `2px dashed ${hovered ? '#C0603A' : '#E5E5E5'}`,
        cursor: 'pointer',
        padding: '1.5rem',
        transition: 'background 0.15s, border-color 0.15s',
        boxSizing: 'border-box',
        textAlign: 'center',
      }}
    >
      <svg
        width="28"
        height="28"
        viewBox="0 0 24 24"
        fill="none"
        stroke={hovered ? '#C0603A' : '#bbb'}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
        style={{ transition: 'stroke 0.15s', flexShrink: 0 }}
      >
        <path d="M12 5v14M5 12h14" />
      </svg>

      <span
        style={{
          fontFamily: 'var(--nd-sans), system-ui, sans-serif',
          fontSize: '0.8rem',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          color: hovered ? '#C0603A' : '#555',
          fontWeight: 600,
          transition: 'color 0.15s',
        }}
      >
        Предложить книгу
      </span>

      <span
        style={{
          fontFamily: 'var(--nd-sans), system-ui, sans-serif',
          fontSize: '0.7rem',
          color: '#999',
          lineHeight: 1.5,
        }}
      >
        Предложите книгу для&nbsp;клуба
      </span>
    </button>
  )
}
