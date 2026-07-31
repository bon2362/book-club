'use client'

import type { CSSProperties } from 'react'

interface Props {
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
}

const buttonStyle: CSSProperties = {
  fontFamily: 'var(--nd-sans)',
  fontSize: '0.6rem',
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
  color: 'var(--text-secondary)',
  background: 'var(--bg-input)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: '0.35rem 0.7rem',
  cursor: 'pointer',
  lineHeight: 1,
}

/** Приблизить / отдалить / вместить — порт TimelineControls на токены проекта. */
export default function TimelineControls({ onZoomIn, onZoomOut, onFit }: Props) {
  return (
    <div
      aria-label="Управление лентой"
      style={{ display: 'flex', gap: '0.4rem', justifyContent: 'flex-end', marginBottom: '0.5rem' }}
    >
      <button type="button" aria-label="Приблизить" title="Приблизить (+)" onClick={onZoomIn} style={buttonStyle}>
        +
      </button>
      <button type="button" aria-label="Отдалить" title="Отдалить (−)" onClick={onZoomOut} style={buttonStyle}>
        −
      </button>
      <button type="button" aria-label="Вместить" title="Вместить всё (F)" onClick={onFit} style={buttonStyle}>
        Вместить
      </button>
    </div>
  )
}
