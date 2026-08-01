'use client'

import { useState } from 'react'
import {
  assignEpochLanes,
  createViewportTransform,
  epochLabelPlacement,
  historicalDateToCoordinate,
  type VisibleRange,
} from '@/lib/timeline'
import type { TimelineEpochView } from '@/lib/timeline/view-model'
import { normalizeEpochColor } from './data-color'

interface Props {
  epochs: TimelineEpochView[]
  enabled: boolean
  showLibrary: boolean
  range: VisibleRange
  width: number
  dragging: boolean
  selectedId?: string | undefined
  onSelect: (id: string) => void
}

/** Высота полосы эпохи и шаг дорожек. */
const EPOCH_BAR_HEIGHT_PX = 21
export const EPOCH_LANE_PITCH_PX = 26

/**
 * Полосы эпох. Дорожки считает `assignEpochLanes`, положение подписи —
 * `epochLabelPlacement`. Перетаскивание дорожек (этап 5) не переносится.
 */
export default function TimelineEpochLayer({
  epochs,
  enabled,
  showLibrary,
  range,
  width,
  dragging,
  selectedId,
  onSelect,
}: Props) {
  const [tooltip, setTooltip] = useState<{ epoch: TimelineEpochView; left: number; top: number } | null>(null)
  const transform = createViewportTransform(range, width)
  const layout = assignEpochLanes(
    epochs.map((epoch) => ({
      id: epoch.id,
      start: epoch.start,
      end: epoch.end,
      ...(epoch.pinnedLane === undefined ? {} : { pinnedLane: epoch.pinnedLane }),
    })),
  )
  const laneById = new Map(layout.placements.map(({ id, lane }) => [id, lane]))
  const span = range.end - range.start
  const visible = epochs.filter((epoch) => {
    if (!enabled || !epoch.visible || (epoch.isLibrary && !showLibrary)) return false
    const start = historicalDateToCoordinate(epoch.start)
    const end = historicalDateToCoordinate(epoch.end)
    return epoch.id === selectedId || (end >= range.start - span && start <= range.end + span)
  })

  return (
    <div
      aria-label="Эпохи"
      data-testid="timeline-epochs"
      style={{
        position: 'relative',
        height: `${Math.max(1, layout.laneCount) * EPOCH_LANE_PITCH_PX}px`,
        overflow: 'hidden',
      }}
    >
      {visible.map((epoch) => {
        const left = transform.toX(historicalDateToCoordinate(epoch.start))
        const right = transform.toX(historicalDateToCoordinate(epoch.end))
        const label = epochLabelPlacement({ left, right, width })
        const lane = laneById.get(epoch.id) ?? 0
        const selected = epoch.id === selectedId
        const color = normalizeEpochColor(epoch.color)

        return (
          <button
            key={epoch.id}
            type="button"
            className={epoch.isLibrary ? 'tl-library-item' : undefined}
            data-testid="timeline-epoch"
            data-epoch-id={epoch.id}
            aria-label={epoch.title}
            aria-pressed={selected}
            onClick={() => onSelect(epoch.id)}
            onMouseEnter={(mouseEvent) => {
              if (dragging) return
              const bounds = mouseEvent.currentTarget.getBoundingClientRect()
              setTooltip({ epoch, left: bounds.left + bounds.width / 2, top: bounds.top - 10 })
            }}
            onMouseLeave={() => setTooltip(null)}
            style={{
              position: 'absolute',
              left: `${left}px`,
              top: `${lane * EPOCH_LANE_PITCH_PX}px`,
              width: `${Math.max(right - left, 4)}px`,
              height: `${EPOCH_BAR_HEIGHT_PX}px`,
              padding: 0,
              border: 'none',
              outline: epoch.isLibrary ? '1px solid var(--tl-axis)' : 'none',
              outlineOffset: epoch.isLibrary ? '-1px' : 0,
              boxShadow: selected ? 'inset 0 -2px 0 var(--text)' : 'none',
              background: epoch.isLibrary ? 'transparent' : color,
              opacity: epoch.isLibrary ? 0.42 : 1,
              cursor: 'pointer',
              textAlign: 'left',
              overflow: 'hidden',
            }}
          >
            <span
              data-testid="timeline-epoch-label"
              style={{
                position: 'relative',
                display: 'block',
                marginLeft: `${label.offset}px`,
                maxWidth: `${label.maxWidth}px`,
                opacity: label.visible ? 1 : 0,
                padding: '0 0.45rem',
                lineHeight: `${EPOCH_BAR_HEIGHT_PX}px`,
                fontFamily: 'var(--nd-serif)',
                fontSize: '0.78rem',
                color: 'var(--text-body)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {epoch.title}
            </span>
          </button>
        )
      })}
      {tooltip !== null && !dragging ? (
        <div
          role="tooltip"
          style={{
            position: 'fixed',
            zIndex: 20,
            left: `${tooltip.left}px`,
            top: `${tooltip.top}px`,
            maxWidth: '22rem',
            transform: 'translate(-50%, -100%)',
            padding: '0.5rem 0.7rem',
            borderRadius: 'var(--radius-control)',
            background: 'var(--bg-input)',
            boxShadow: 'var(--shadow-pop)',
            pointerEvents: 'none',
          }}
        >
          <div style={{ font: '0.9rem/1.25 var(--nd-serif)', color: 'var(--text)' }}>{tooltip.epoch.title}</div>
          {tooltip.epoch.isLibrary ? <div style={{ marginTop: '0.35rem', font: '0.68rem/1.2 var(--nd-sans)', color: 'var(--accent)' }}>Есть в базе · клик — прикрепить</div> : null}
        </div>
      ) : null}
    </div>
  )
}
