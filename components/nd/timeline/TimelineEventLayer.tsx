'use client'

import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import {
  createViewportTransform,
  dateRangeForEvent,
  tlLayout,
  type VisibleRange,
} from '@/lib/timeline'
import type { TimelineEventView } from '@/lib/timeline/view-model'
import { normalizeDataColor } from './data-color'
import {
  MARKER_ROW_HEIGHT_PX,
  eventBottom,
  eventLaneCapacity,
} from './event-area'
import { formatCanvasDate } from './format-historical-date'
import { createTextMeasurer, EVENT_DATE_FONT, EVENT_LABEL_FONT } from './measure-text'

/**
 * Слой событий: точки, интервалы и кластеры. Вся раскладка приходит из
 * `tlLayout` — здесь ничего не считается, только размещается.
 * Ручки изменения границ интервала (этап 5) не переносятся.
 */

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
function Connector({ x, lane, selected, ghost = false }: { x: number; lane: number; selected: boolean; ghost?: boolean }) {
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
        backgroundImage: ghost ? 'linear-gradient(to bottom, var(--tl-connector) 50%, transparent 50%)' : 'none',
        backgroundSize: ghost ? '1px 4px' : 'auto',
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
    width: `${EVENT_MARKER_SIZE_PX}px`,
    padding: 0,
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    zIndex: selected ? 2 : 1,
  }
}

function Dot({ color, selected, ghost = false }: { color: string; selected: boolean; ghost?: boolean }) {
  return (
    <span
      aria-hidden="true"
      style={{
        flexShrink: 0,
        width: `${EVENT_MARKER_SIZE_PX}px`,
        height: `${EVENT_MARKER_SIZE_PX}px`,
        borderRadius: '50%',
        background: ghost ? 'var(--bg)' : color,
        boxShadow: selected
          ? '0 0 0 2px var(--bg), 0 0 0 3px var(--text)'
          : ghost
            ? `inset 0 0 0 1px ${color}, 0 0 0 3px var(--bg)`
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
  mode,
  selected,
  onSelect,
  onHover,
}: {
  event: TimelineEventView
  x: number
  lane: number
  mode: 'label' | 'dot'
  selected: boolean
  onSelect: () => void
  onHover: (event: TimelineEventView | null, element?: HTMLElement) => void
}): ReactNode {
  const color = normalizeDataColor(event.color)
  return (
    <button
      type="button"
      className={event.isLibrary ? 'tl-library-item' : undefined}
      data-testid="timeline-event"
      data-event-id={event.id}
      data-shape="point"
      aria-label={event.title}
      aria-pressed={selected}
      onClick={onSelect}
      onMouseEnter={(mouseEvent) => onHover(event, mouseEvent.currentTarget)}
      onMouseLeave={() => onHover(null)}
      style={{ ...markerButtonStyle(x, lane, selected), opacity: event.isLibrary ? 0.42 : 1 }}
    >
      <Dot color={color} selected={selected} ghost={event.isLibrary} />
      {mode === 'label' ? (
        <span
          style={{
            position: 'absolute',
            top: '50%',
            left: 'calc(100% + 0.5rem)',
            transform: 'translateY(-50%)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <span
            data-testid="timeline-event-label"
            style={{ ...labelStyle, fontWeight: selected ? 600 : 400 }}
          >
            {event.title}
          </span>
          <span style={dateStyle}>{formatCanvasDate(event)}</span>
        </span>
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
  labelX,
  labelled,
  onSelect,
  onHover,
}: {
  event: TimelineEventView
  startX: number
  endX: number
  lane: number
  selected: boolean
  labelX: number
  labelled: boolean
  onSelect: () => void
  onHover: (event: TimelineEventView | null, element?: HTMLElement) => void
}): ReactNode {
  const color = normalizeDataColor(event.color)

  return (
    <button
      type="button"
      className={event.isLibrary ? 'tl-library-item' : undefined}
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
        opacity: event.isLibrary ? 0.42 : 1,
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
          background: event.isLibrary ? 'transparent' : color,
          borderTop: event.isLibrary ? `1px dashed ${color}` : 'none',
        }}
      />
      <span aria-hidden="true" style={{ position: 'absolute', left: 0, bottom: 0, width: '1px', height: '8px', background: color }} />
      <span aria-hidden="true" style={{ position: 'absolute', right: 0, bottom: 0, width: '1px', height: '8px', background: color }} />
      {labelled ? (
        <span
          style={{
            position: 'absolute',
            left: `${labelX - startX}px`,
            bottom: '5px',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <span
            data-testid="timeline-event-label"
            style={{ ...labelStyle, fontWeight: selected ? 600 : 400 }}
          >
            {event.title}
          </span>
          <span style={dateStyle}>{formatCanvasDate(event)}</span>
        </span>
      ) : null}
    </button>
  )
}

interface Props {
  events: TimelineEventView[]
  visibleEventIds: ReadonlySet<string>
  range: VisibleRange
  width: number
  height: number
  dragging: boolean
  selectedId?: string | undefined
  onSelect: (id: string) => void
  onCluster: (range: { start: number; end: number }) => void
}

export default function TimelineEventLayer({
  events,
  visibleEventIds,
  range,
  width,
  height,
  dragging,
  selectedId,
  onSelect,
  onCluster,
}: Props) {
  const [tooltip, setTooltip] = useState<{ event: TimelineEventView; left: number; top: number } | null>(null)
  const measureText = useMemo(() => createTextMeasurer(), [])
  const transform = createViewportTransform(range, width)
  const eventById = new Map(events.map((event) => [event.id, event]))
  const layout = tlLayout({
    events: events.map((event) => {
      const eventRange = dateRangeForEvent(event)
      const start = transform.toX(eventRange.start)
      return {
        id: event.id,
        title: event.title,
        dateLabel: formatCanvasDate(event),
        startX: start,
        isLibrary: event.isLibrary,
        ...(event.end !== undefined || event.ongoing
          ? { endX: Math.max(transform.toX(eventRange.end), start + 4) }
          : {}),
      }
    }),
    width,
    capacity: eventLaneCapacity(height),
    markerWidth: EVENT_MARKER_SIZE_PX,
    selectedId,
    measureText,
    labelFont: EVENT_LABEL_FONT,
    dateFont: EVENT_DATE_FONT,
  })

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
      {layout.spans.map((placement) => {
        const event = eventById.get(placement.id)
        if (
          event === undefined ||
          !visibleEventIds.has(placement.id) ||
          !placement.intersectsCanvas
        ) return null
        const startVisible = placement.startX >= 0 && placement.startX <= width
        const endVisible = placement.endX >= 0 && placement.endX <= width
        return (
          <span key={event.id}>
            {startVisible ? <Connector x={placement.startX} lane={placement.lane} selected={event.id === selectedId} ghost={event.isLibrary} /> : null}
            {!event.ongoing && endVisible ? (
              <Connector x={placement.endX} lane={placement.lane} selected={event.id === selectedId} ghost={event.isLibrary} />
            ) : null}
            <IntervalEvent
              event={event}
              startX={placement.startX}
              endX={placement.endX}
              lane={placement.lane}
              labelX={placement.labelX}
              labelled={placement.labelled}
              selected={event.id === selectedId}
              onSelect={() => onSelect(event.id)}
              onHover={showTooltip}
            />
          </span>
        )
      })}

      {layout.markers.map((marker) => {
        const event = eventById.get(marker.id)
        if (
          event === undefined ||
          !visibleEventIds.has(marker.id) ||
          !marker.intersectsCanvas
        ) return null
        return (
          <span key={event.id}>
            <Connector x={marker.x} lane={marker.lane} selected={event.id === selectedId} ghost={event.isLibrary} />
            <PointEvent
              event={event}
              x={marker.x}
              lane={marker.lane}
              mode={marker.mode}
              selected={event.id === selectedId}
              onSelect={() => onSelect(event.id)}
              onHover={showTooltip}
            />
          </span>
        )
      })}
      {layout.clusters.map((cluster) => {
        const memberIds = cluster.memberIds.filter((id) => visibleEventIds.has(id))
        if (!cluster.intersectsCanvas || memberIds.length === 0) return null
        return <span key={cluster.id}>
          <Connector x={cluster.x} lane={cluster.lane} selected={false} />
          <button
            type="button"
            data-testid="timeline-cluster"
            aria-label={`${memberIds.length} событий — приблизить`}
            onClick={() => onCluster({ start: transform.fromX(cluster.start), end: transform.fromX(cluster.end) })}
            style={{
              ...markerButtonStyle(cluster.x, cluster.lane, false),
              width: '20px',
              left: `${cluster.x - 10}px`,
              display: 'grid',
              placeItems: 'center',
              borderRadius: '50%',
              border: '1px solid var(--text)',
              background: 'var(--bg-input)',
              fontFamily: 'var(--nd-sans)',
              fontSize: '0.62rem',
              color: 'var(--text)',
            }}
          >
            {memberIds.length}
          </button>
        </span>
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
          {tooltip.event.isLibrary ? <div style={{ marginTop: '0.35rem', font: '0.68rem/1.2 var(--nd-sans)', color: 'var(--accent)' }}>Есть в базе · клик — прикрепить</div> : null}
        </div>
      ) : null}
    </div>
  )
}
