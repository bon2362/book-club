'use client'

import { useState, type CSSProperties, type ReactNode } from 'react'
import {
  buildEventConnection,
  buildEventLayout,
  createViewportTransform,
  dateRangeForEvent,
  finishedIntervalCollisionBox,
  EVENT_DOT_BOX_PX,
  type DensityStage,
  type VisibleRange,
} from '@/lib/timeline'
import type { TimelineEventView } from '@/lib/timeline/view-model'
import { normalizeDataColor } from './data-color'
import {
  MARKER_ROW_HEIGHT_PX,
  eventBottom,
  eventLaneCapacity,
  labelMaxWidth,
} from './event-area'
import { formatCanvasDate } from './format-historical-date'

/**
 * Слой событий: точки, интервалы и кластеры. Вся раскладка приходит из
 * `buildEventLayout` — здесь ничего не считается, только размещается.
 * Ручки изменения границ интервала (этап 5) не переносятся.
 */

const EVENT_HORIZONTAL_CLEARANCE_PX = 12
const EVENT_MARKER_SIZE_PX = 8

const labelStyle: CSSProperties = {
  fontFamily: 'var(--nd-sans)',
  fontSize: '0.845rem',
  lineHeight: 1,
  color: 'var(--text)',
  whiteSpace: 'nowrap',
}

const dateStyle: CSSProperties = {
  fontFamily: 'var(--nd-mono)',
  fontSize: '0.7rem',
  lineHeight: 1,
  letterSpacing: '0.02em',
  color: 'var(--text-muted)',
  whiteSpace: 'nowrap',
}

/** Вертикальный волосок от метки события к оси лет. */
function Connector({ x, lane, selected }: { x: number; lane: number; selected: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: `${x}px`,
        bottom: 0,
        width: '1px',
        height: `${eventBottom(lane)}px`,
        background: selected ? 'var(--accent)' : 'var(--tl-connector)',
        opacity: selected ? 0.55 : 1,
      }}
    />
  )
}

function markerButtonStyle(x: number, lane: number, selected: boolean): CSSProperties {
  return {
    position: 'absolute',
    left: `${x - EVENT_MARKER_SIZE_PX / 2}px`,
    bottom: `${eventBottom(lane)}px`,
    height: `${MARKER_ROW_HEIGHT_PX}px`,
    display: 'flex',
    alignItems: 'center',
    gap: '0.5rem',
    padding: 0,
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    textAlign: 'left',
    zIndex: selected ? 2 : 1,
  }
}

/** Ряд метки помимо текста: сама метка, два отступа и год. */
const POINT_ROW_CHROME_PX = 64
/** Ряд интервала помимо текста: засечка, отступы и диапазон «1618 — 1648». */
const INTERVAL_ROW_CHROME_PX = 96

const clampedLabelStyle = (maxWidth: number): CSSProperties => ({
  maxWidth: `${maxWidth}px`,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
})

function Dot({ color, selected }: { color: string; selected: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{
        flexShrink: 0,
        width: `${EVENT_MARKER_SIZE_PX}px`,
        height: `${EVENT_MARKER_SIZE_PX}px`,
        borderRadius: '50%',
        background: color,
        boxShadow: selected
          ? '0 0 0 2px var(--bg), 0 0 0 3px var(--text)'
          : '0 0 0 3px var(--bg)',
      }}
    >
    </span>
  )
}

function PointEvent({
  event,
  x,
  lane,
  label,
  selected,
  width,
  onSelect,
  onHover,
}: {
  event: TimelineEventView
  x: number
  lane: number
  label: string | undefined
  selected: boolean
  width: number
  onSelect: () => void
  onHover: (event: TimelineEventView | null, element?: HTMLElement) => void
}): ReactNode {
  const color = normalizeDataColor(event.color)
  const maxWidth = labelMaxWidth(x, width, POINT_ROW_CHROME_PX)
  return (
    <button
      type="button"
      data-testid="timeline-event"
      data-event-id={event.id}
      data-shape="point"
      aria-label={event.title}
      aria-pressed={selected}
      onClick={onSelect}
      onMouseEnter={(mouseEvent) => onHover(event, mouseEvent.currentTarget)}
      onMouseLeave={() => onHover(null)}
      style={markerButtonStyle(x, lane, selected)}
    >
      <Dot color={color} selected={selected} />
      {label ? (
        <>
          <span
            data-testid="timeline-event-label"
            style={{ ...labelStyle, ...clampedLabelStyle(maxWidth), fontWeight: selected ? 600 : 400 }}
          >
            {label}
          </span>
          <span style={dateStyle}>{formatCanvasDate(event)}</span>
        </>
      ) : null}
    </button>
  )
}

function IntervalEvent({
  event,
  startX,
  endX,
  lane,
  selected,
  width,
  onSelect,
  onHover,
}: {
  event: TimelineEventView
  startX: number
  endX: number
  lane: number
  selected: boolean
  width: number
  onSelect: () => void
  onHover: (event: TimelineEventView | null, element?: HTMLElement) => void
}): ReactNode {
  const color = normalizeDataColor(event.color)
  // Подпись интервала растёт вправо от его начала. У правого края её ужимаем,
  // а не разворачиваем: раскладка резервирует место справа, и развёрнутая
  // подпись наезжала бы на соседей.
  const maxWidth = labelMaxWidth(startX, width, INTERVAL_ROW_CHROME_PX)

  return (
    <button
      type="button"
      data-testid="timeline-event"
      data-event-id={event.id}
      data-shape="interval"
      aria-label={event.title}
      aria-pressed={selected}
      onClick={onSelect}
      onMouseEnter={(mouseEvent) => onHover(event, mouseEvent.currentTarget)}
      onMouseLeave={() => onHover(null)}
      style={{
        position: 'absolute',
        left: `${startX}px`,
        bottom: `${eventBottom(lane)}px`,
        width: `${Math.max(endX - startX, 4)}px`,
        height: `${MARKER_ROW_HEIGHT_PX}px`,
        padding: 0,
        border: 'none',
        background: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        zIndex: selected ? 2 : 1,
      }}
    >
      {/* Отрезок от начала к концу — линией цвета типа, без заливки блока. */}
      {selected ? (
        <span
          aria-hidden="true"
          style={{ position: 'absolute', inset: '-2px 0 0', background: color, opacity: 0.1 }}
        />
      ) : null}
      <span
        aria-hidden="true"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          height: selected ? '3px' : '2px',
          background: color,
        }}
      />
      <span aria-hidden="true" style={{ position: 'absolute', left: 0, bottom: 0, width: '1px', height: '8px', background: color }} />
      <span aria-hidden="true" style={{ position: 'absolute', right: 0, bottom: 0, width: '1px', height: '8px', background: color }} />
      <span
        style={{
          position: 'absolute',
          left: 0,
          bottom: '5px',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}
      >
        <span
          data-testid="timeline-event-label"
          style={{ ...labelStyle, ...clampedLabelStyle(maxWidth), fontWeight: selected ? 600 : 400 }}
        >
          {event.title}
        </span>
        <span style={dateStyle}>{formatCanvasDate(event)}</span>
      </span>
    </button>
  )
}

interface Props {
  events: TimelineEventView[]
  range: VisibleRange
  width: number
  densityStage: DensityStage
  height: number
  dragging: boolean
  showAll: boolean
  selectedId?: string | undefined
  onSelect: (id: string) => void
  onCluster: (range: { start: number; end: number }) => void
}

export default function TimelineEventLayer({
  events,
  range,
  width,
  height,
  dragging,
  densityStage,
  showAll,
  selectedId,
  onSelect,
  onCluster,
}: Props) {
  const [tooltip, setTooltip] = useState<{ event: TimelineEventView; left: number; top: number } | null>(null)
  const transform = createViewportTransform(range, width)
  const span = range.end - range.start
  const visible = events.filter((event) => {
    const eventRange = dateRangeForEvent(event)
    return (
      event.id === selectedId ||
      (eventRange.end >= range.start - span && eventRange.start <= range.end + span)
    )
  })
  const points = visible.filter((event) => event.end === undefined && !event.ongoing)
  const intervals = visible.filter((event) => event.end !== undefined || event.ongoing)
  const pointById = new Map(points.map((event) => [event.id, event]))

  const intervalBoxes = intervals.map((event) => {
    const eventRange = dateRangeForEvent(event)
    const start = transform.toX(eventRange.start)
    const end = Math.max(transform.toX(eventRange.end), start + EVENT_DOT_BOX_PX)
    return event.end === undefined
      ? { id: event.id, start, end }
      : finishedIntervalCollisionBox({ id: event.id, start, end, label: event.title })
  })

  const laneCapacity = eventLaneCapacity(height)
  const layout = buildEventLayout({
    points: points.map((event) => ({
      id: event.id,
      x: transform.toX(dateRangeForEvent(event).start),
      label: event.title,
      ...(event.id === selectedId ? { selected: true } : {}),
    })),
    intervalBoxes,
    preferredStage: densityStage,
    showAll,
    laneCapacity,
    horizontalClearance: EVENT_HORIZONTAL_CLEARANCE_PX,
  })
  const laneById = new Map(layout.placements.map(({ id, lane }) => [id, lane]))

  function showTooltip(event: TimelineEventView | null, element?: HTMLElement): void {
    if (event === null || element === undefined || dragging) {
      setTooltip(null)
      return
    }
    const bounds = element.getBoundingClientRect()
    setTooltip({ event, left: bounds.left + bounds.width / 2, top: bounds.top - 10 })
  }

  return (
    <div
      aria-label="События"
      data-testid="timeline-events"
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
    >
      {intervals.map((event) => {
        const connection = buildEventConnection(event, range, width)
        if (connection === undefined || connection.kind === 'point') return null
        const lane = laneById.get(event.id) ?? 0
        return (
          <span key={event.id}>
            {connection.startVisible ? <Connector x={connection.startX} lane={lane} selected={event.id === selectedId} /> : null}
            {connection.kind === 'finished-interval' && connection.endVisible ? (
              <Connector x={connection.endX} lane={lane} selected={event.id === selectedId} />
            ) : null}
            <IntervalEvent
              event={event}
              startX={connection.startX}
              endX={connection.endX}
              lane={lane}
              selected={event.id === selectedId}
              width={width}
              onSelect={() => onSelect(event.id)}
              onHover={showTooltip}
            />
          </span>
        )
      })}

      {layout.markers.map((marker) => {
        const lane = laneById.get(marker.id) ?? 0

        if (marker.type === 'cluster') {
          return (
            <span key={marker.id}>
              <Connector x={marker.x} lane={lane} selected={false} />
              <button
                type="button"
                data-testid="timeline-cluster"
                aria-label={`${marker.count} событий — приблизить`}
                onClick={() => onCluster({ start: transform.fromX(marker.start), end: transform.fromX(marker.end) })}
                style={{
                  ...markerButtonStyle(marker.x, lane, false),
                  width: `${EVENT_DOT_BOX_PX}px`,
                  justifyContent: 'center',
                  borderRadius: '50%',
                  border: '1px solid var(--text)',
                  background: 'var(--bg-input)',
                  fontFamily: 'var(--nd-sans)',
                  fontSize: '0.62rem',
                  color: 'var(--text)',
                }}
              >
                {marker.count}
              </button>
            </span>
          )
        }

        const event = pointById.get(marker.id)
        if (event === undefined) return null
        return (
          <span key={event.id}>
            <Connector x={marker.x} lane={lane} selected={event.id === selectedId} />
            <PointEvent
              event={event}
              x={marker.x}
              lane={lane}
              label={marker.label}
              selected={event.id === selectedId}
              width={width}
              onSelect={() => onSelect(event.id)}
              onHover={showTooltip}
            />
          </span>
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
          <div style={{ font: '0.9rem/1.25 var(--nd-serif)', color: 'var(--text)' }}>
            <span aria-hidden="true">{tooltip.event.icon} </span>{tooltip.event.title}
          </div>
          <div style={{ marginTop: '0.15rem', font: '0.68rem/1 var(--nd-mono)', color: 'var(--text-muted)' }}>
            {formatCanvasDate(tooltip.event)}
          </div>
        </div>
      ) : null}
    </div>
  )
}
