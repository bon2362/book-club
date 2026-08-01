'use client'

import type { CSSProperties } from 'react'

interface Props {
  onZoomIn: () => void
  onZoomOut: () => void
}

const buttonStyle: CSSProperties = {
  fontFamily: 'var(--nd-sans)',
  fontSize: '0.62rem',
  textTransform: 'uppercase',
  letterSpacing: '0.1em',
  color: 'var(--text-secondary)',
  background: 'var(--bg-input)',
  border: '1px solid var(--hair)',
  borderRadius: 'var(--radius)',
  padding: '0.3rem 0.55rem',
  cursor: 'pointer',
  lineHeight: 1,
}

/** Приблизить / отдалить — порт TimelineControls на токены проекта. */
export default function TimelineControls({ onZoomIn, onZoomOut }: Props) {
  return (
    <div
      aria-label="Управление лентой"
      style={{ display: 'flex', gap: '0.35rem', justifyContent: 'flex-end' }}
    >
      <button className="tl-tool" type="button" aria-label="Приблизить" title="Приблизить (+)" onClick={onZoomIn} style={buttonStyle}>
        +
      </button>
      <button className="tl-tool" type="button" aria-label="Отдалить" title="Отдалить (−)" onClick={onZoomOut} style={buttonStyle}>
        −
      </button>
    </div>
  )
}
