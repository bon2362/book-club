'use client'

import type { CSSProperties } from 'react'
import { normalizeDataColor } from './data-color'
import TimelineControls from './TimelineControls'

export interface TimelineLegendType {
  id: string
  title: string
  color: string
  count: number
}

interface Props {
  eventTypes: TimelineLegendType[]
  enabledTypeIds: ReadonlySet<string>
  epochsEnabled: boolean
  epochCount: number
  onToggleType: (id: string) => void
  onToggleEpochs: () => void
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
  showLibrary?: boolean
  onToggleLibrary?: () => void
}

const chipStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '0.35rem',
  minHeight: '28px',
  padding: '0.25rem 0.4rem',
  border: 'none',
  borderRadius: 'var(--radius)',
  background: 'transparent',
  fontFamily: 'var(--nd-sans)',
  fontSize: '0.76rem',
  cursor: 'pointer',
}

const countStyle: CSSProperties = {
  fontFamily: 'var(--nd-mono)',
  fontSize: '0.68rem',
  color: 'var(--text-muted)',
}

/** Постоянная легенда и локальный фильтр содержимого публичной ленты. */
export default function TimelineLegend({
  eventTypes,
  enabledTypeIds,
  epochsEnabled,
  epochCount,
  onToggleType,
  onToggleEpochs,
  onZoomIn,
  onZoomOut,
  onFit,
  showLibrary = false,
  onToggleLibrary,
}: Props) {
  return (
    <div
      data-testid="timeline-legend"
      style={{
        minHeight: '42px',
        display: 'flex',
        alignItems: 'center',
        gap: '0.35rem',
        flexWrap: 'wrap',
      }}
    >
      {eventTypes.map((eventType) => {
        const enabled = enabledTypeIds.has(eventType.id)
        const color = normalizeDataColor(eventType.color)
        return (
          <button
            key={eventType.id}
            type="button"
            className="tl-chip"
            aria-pressed={enabled}
            onClick={() => onToggleType(eventType.id)}
            style={{
              ...chipStyle,
              color: enabled ? 'var(--text)' : 'var(--text-muted)',
              textDecoration: enabled ? 'none' : 'line-through',
              textDecorationColor: 'var(--tl-axis)',
            }}
          >
            <span
              aria-hidden="true"
              style={{
                width: '9px',
                height: '9px',
                flexShrink: 0,
                borderRadius: '50%',
                background: enabled ? color : 'transparent',
                boxShadow: enabled ? 'none' : 'inset 0 0 0 1px var(--tl-axis)',
              }}
            />
            <span>{eventType.title}</span>
            <span style={countStyle}>{eventType.count}</span>
          </button>
        )
      })}
      <span aria-hidden="true" style={{ width: '1px', height: '18px', background: 'var(--hair)' }} />
      <button
        type="button"
        className="tl-chip"
        aria-pressed={epochsEnabled}
        onClick={onToggleEpochs}
        style={{
          ...chipStyle,
          color: epochsEnabled ? 'var(--text)' : 'var(--text-muted)',
          textDecoration: epochsEnabled ? 'none' : 'line-through',
          textDecorationColor: 'var(--tl-axis)',
        }}
      >
        <span
          aria-hidden="true"
          style={{
            width: '9px',
            height: '9px',
            flexShrink: 0,
            background: epochsEnabled ? 'var(--tl-epoch-1)' : 'transparent',
            boxShadow: epochsEnabled ? 'none' : 'inset 0 0 0 1px var(--tl-axis)',
          }}
        />
        <span>Эпохи</span>
        <span style={countStyle}>{epochCount}</span>
      </button>
      {onToggleLibrary ? (
        <button
          type="button"
          className="tl-chip"
          aria-pressed={showLibrary}
          onClick={onToggleLibrary}
          style={{ ...chipStyle, color: showLibrary ? 'var(--text)' : 'var(--text-muted)', boxShadow: showLibrary ? 'inset 0 -1px 0 var(--accent)' : 'none' }}
        >
          <span aria-hidden="true" style={{ width: '9px', height: '9px', borderRadius: '50%', background: 'var(--bg)', boxShadow: 'inset 0 0 0 1px var(--tl-axis)' }} />
          Вся база
        </button>
      ) : null}
      <div style={{ flex: '1 1 1rem' }} />
      <TimelineControls onZoomIn={onZoomIn} onZoomOut={onZoomOut} onFit={onFit} />
    </div>
  )
}
