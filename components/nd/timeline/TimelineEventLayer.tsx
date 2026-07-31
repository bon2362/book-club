'use client'

import type { CSSProperties, ReactNode } from 'react'
import {
  buildEventConnection,
  buildEventLayout,
  createViewportTransform,
  dateRangeForEvent,
  estimateEventLabelTextWidth,
  finishedIntervalCollisionBox,
  EVENT_DOT_BOX_PX,
  EVENT_LABEL_MAX_TEXT_WIDTH_PX,
  type DensityStage,
  type VisibleRange,
} from '@/lib/timeline'
import type { TimelineEventView } from '@/lib/timeline/view-model'
import { normalizeDataColor } from './data-color'
import { formatCanvasDate } from './format-historical-date'

/**
 * Слой событий: точки, интервалы и кластеры. Вся раскладка приходит из
 * `buildEventLayout` — здесь ничего не считается, только размещается.
 * Ручки изменения границ интервала (этап 5) не переносятся.
 */

export const EVENT_LANE_PITCH_PX = 46
export const EVENT_LANE_BASE_PX = 16
/** Предел высоты полотна: сколько дорожек раскладка вообще может занять. */
export const EVENT_AREA_HEIGHT_PX = 380
/** Ниже этой высоты полотно не сжимается, даже если событий одна дорожка. */
const EVENT_AREA_MIN_HEIGHT_PX = 120
const EVENT_HORIZONTAL_CLEARANCE_PX = 12
const MARKER_ROW_HEIGHT_PX = 20

const eventBottom = (lane: number) => EVENT_LANE_BASE_PX + lane * EVENT_LANE_PITCH_PX

const labelStyle: CSSProperties = {
  fontFamily: 'var(--nd-sans)',
  fontSize: '0.84rem',
  color: 'var(--text)',
  whiteSpace: 'nowrap',
}

const dateStyle: CSSProperties = {
  fontFamily: 'var(--nd-mono)',
  fontSize: '0.65rem',
  color: 'var(--text-muted)',
  whiteSpace: 'nowrap',
}

/** Вертикальный волосок от метки события к оси лет. */
function Connector({ x, lane }: { x: number; lane: number }) {
  return (
    <span
      aria-hidden="true"
      style={{
        position: 'absolute',
        left: `${x}px`,
        bottom: 0,
        width: '1px',
        height: `${eventBottom(lane)}px`,
        background: 'var(--border)',
      }}
    />
  )
}

function markerButtonStyle(x: number, lane: number, selected: boolean): CSSProperties {
  return {
    position: 'absolute',
    left: `${x - EVENT_DOT_BOX_PX / 2}px`,
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

function Dot({ color, icon, selected }: { color: string; icon: string; selected: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{
        flexShrink: 0,
        width: `${EVENT_DOT_BOX_PX}px`,
        height: `${EVENT_DOT_BOX_PX}px`,
        borderRadius: '50%',
        background: color,
        border: selected ? '2px solid var(--text)' : '2px solid var(--bg)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '0.6rem',
        lineHeight: 1,
      }}
    >
      {icon}
    </span>
  )
}

function PointEvent({
  event,
  x,
  lane,
  label,
  selected,
  onSelect,
}: {
  event: TimelineEventView
  x: number
  lane: number
  label: string | undefined
  selected: boolean
  onSelect: () => void
}): ReactNode {
  const color = normalizeDataColor(event.color)
  // Подсказка нужна, когда подпись сокращена или её нет вовсе. Она нативная:
  // собственный тултип на React-состоянии залипал после клика — выбор события
  // сдвигает полотно, и элемент уезжает из-под курсора без `pointerleave`.
  const truncated = label !== event.title || estimateEventLabelTextWidth(event.title) >= EVENT_LABEL_MAX_TEXT_WIDTH_PX

  return (
    <button
      type="button"
      data-testid="timeline-event"
      data-event-id={event.id}
      data-shape="point"
      aria-label={event.title}
      aria-pressed={selected}
      title={truncated ? `${event.title} · ${formatCanvasDate(event)}` : undefined}
      onClick={onSelect}
      style={markerButtonStyle(x, lane, selected)}
    >
      <Dot color={color} icon={event.icon} selected={selected} />
      {label ? (
        <>
          <span data-testid="timeline-event-label" style={{ ...labelStyle, fontWeight: selected ? 600 : 400 }}>
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
  onSelect,
}: {
  event: TimelineEventView
  startX: number
  endX: number
  lane: number
  selected: boolean
  onSelect: () => void
}): ReactNode {
  const color = normalizeDataColor(event.color)

  return (
    <button
      type="button"
      data-testid="timeline-event"
      data-event-id={event.id}
      data-shape="interval"
      aria-label={event.title}
      aria-pressed={selected}
      title={`${event.title} · ${formatCanvasDate(event)}`}
      onClick={onSelect}
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
        <span data-testid="timeline-event-label" style={{ ...labelStyle, fontWeight: selected ? 600 : 400 }}>
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
  showAll: boolean
  selectedId?: string | undefined
  onSelect: (id: string) => void
  onCluster: (range: { start: number; end: number }) => void
}

export default function TimelineEventLayer({
  events,
  range,
  width,
  densityStage,
  showAll,
  selectedId,
  onSelect,
  onCluster,
}: Props) {
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

  const laneCapacity = Math.max(1, Math.floor((EVENT_AREA_HEIGHT_PX - EVENT_LANE_BASE_PX) / EVENT_LANE_PITCH_PX))
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
  // Полотно занимает столько, сколько заняли дорожки: пустая высота сверху
  // выглядела бы обрывом ленты.
  const height = Math.min(
    EVENT_AREA_HEIGHT_PX,
    Math.max(EVENT_AREA_MIN_HEIGHT_PX, eventBottom(layout.laneCount) + MARKER_ROW_HEIGHT_PX),
  )

  return (
    <div
      aria-label="События"
      data-testid="timeline-events"
      style={{ position: 'relative', height: `${height}px`, overflow: 'hidden' }}
    >
      {intervals.map((event) => {
        const connection = buildEventConnection(event, range, width)
        if (connection === undefined || connection.kind === 'point') return null
        const lane = laneById.get(event.id) ?? 0
        return (
          <span key={event.id}>
            {connection.startVisible ? <Connector x={connection.startX} lane={lane} /> : null}
            {connection.kind === 'finished-interval' && connection.endVisible ? (
              <Connector x={connection.endX} lane={lane} />
            ) : null}
            <IntervalEvent
              event={event}
              startX={connection.startX}
              endX={connection.endX}
              lane={lane}
              selected={event.id === selectedId}
              onSelect={() => onSelect(event.id)}
            />
          </span>
        )
      })}

      {layout.markers.map((marker) => {
        const lane = laneById.get(marker.id) ?? 0

        if (marker.type === 'cluster') {
          return (
            <span key={marker.id}>
              <Connector x={marker.x} lane={lane} />
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
            <Connector x={marker.x} lane={lane} />
            <PointEvent
              event={event}
              x={marker.x}
              lane={lane}
              label={marker.label}
              selected={event.id === selectedId}
              onSelect={() => onSelect(event.id)}
            />
          </span>
        )
      })}
    </div>
  )
}
