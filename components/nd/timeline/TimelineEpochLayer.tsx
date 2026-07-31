'use client'

import {
  assignEpochLanes,
  createViewportTransform,
  epochLabelPlacement,
  historicalDateToCoordinate,
  type VisibleRange,
} from '@/lib/timeline'
import type { TimelineEpochView } from '@/lib/timeline/view-model'
import { normalizeDataColor } from './data-color'

interface Props {
  epochs: TimelineEpochView[]
  range: VisibleRange
  width: number
  selectedId?: string | undefined
  onSelect: (id: string) => void
}

/** Высота полосы эпохи и шаг дорожек. */
const EPOCH_BAR_HEIGHT_PX = 24
export const EPOCH_LANE_PITCH_PX = 29

/**
 * Полосы эпох. Дорожки считает `assignEpochLanes`, положение подписи —
 * `epochLabelPlacement`. Перетаскивание дорожек (этап 5) не переносится.
 */
export default function TimelineEpochLayer({ epochs, range, width, selectedId, onSelect }: Props) {
  const transform = createViewportTransform(range, width)
  const activeEpochs = epochs.filter((epoch) => epoch.visible)
  const layout = assignEpochLanes(
    activeEpochs.map((epoch) => ({
      id: epoch.id,
      start: epoch.start,
      end: epoch.end,
      ...(epoch.pinnedLane === undefined ? {} : { pinnedLane: epoch.pinnedLane }),
    })),
  )
  const laneById = new Map(layout.placements.map(({ id, lane }) => [id, lane]))
  const span = range.end - range.start
  const visible = activeEpochs.filter((epoch) => {
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
        const color = normalizeDataColor(epoch.color)

        return (
          <button
            key={epoch.id}
            type="button"
            data-testid="timeline-epoch"
            data-epoch-id={epoch.id}
            aria-label={epoch.title}
            aria-pressed={selected}
            title={epoch.title}
            onClick={() => onSelect(epoch.id)}
            style={{
              position: 'absolute',
              left: `${left}px`,
              top: `${lane * EPOCH_LANE_PITCH_PX}px`,
              width: `${Math.max(right - left, 4)}px`,
              height: `${EPOCH_BAR_HEIGHT_PX}px`,
              padding: 0,
              border: 'none',
              borderBottom: selected ? '2px solid var(--text)' : '2px solid transparent',
              borderRadius: 'var(--radius)',
              background: 'transparent',
              cursor: 'pointer',
              textAlign: 'left',
              overflow: 'hidden',
            }}
          >
            {/* Заливка своим цветом из данных — прозрачностью, чтобы подпись читалась. */}
            <span
              aria-hidden="true"
              style={{
                position: 'absolute',
                inset: 0,
                background: color,
                opacity: selected ? 0.42 : 0.26,
              }}
            />
            <span
              data-testid="timeline-epoch-label"
              style={{
                position: 'relative',
                display: 'block',
                marginLeft: `${label.offset}px`,
                maxWidth: `${label.maxWidth}px`,
                opacity: label.visible ? 1 : 0,
                padding: '0 0.4rem',
                lineHeight: `${EPOCH_BAR_HEIGHT_PX}px`,
                fontFamily: 'var(--nd-serif)',
                fontSize: '0.8rem',
                color: 'var(--text)',
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
    </div>
  )
}
