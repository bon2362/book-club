'use client'

import { useMemo, type CSSProperties, type ReactNode } from 'react'
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
  eventLanePitch,
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
function Connector({ x, lane, pitch, active, ghost = false }: { x: number; lane: number; pitch: number; active: boolean; ghost?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`tl-connector${active ? ' is-on' : ''}${ghost ? ' is-ghost' : ''}`}
      style={{
        position: 'absolute',
        left: `${x}px`,
        bottom: 0,
        height: `${eventBottom(lane, pitch)}px`,
      }}
    />
  )
}

function markerButtonStyle(x: number, lane: number, pitch: number, active: boolean): CSSProperties {
  return {
    position: 'absolute',
    left: `${x - EVENT_MARKER_SIZE_PX / 2}px`,
    bottom: `${eventBottom(lane, pitch)}px`,
    height: `${MARKER_ROW_HEIGHT_PX}px`,
    width: `${EVENT_MARKER_SIZE_PX}px`,
    padding: 0,
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    zIndex: active ? 2 : 1,
  }
}

function Dot({ color, active, ghost = false }: { color: string; active: boolean; ghost?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className="tl-dot"
      style={{
        flexShrink: 0,
        width: `${EVENT_MARKER_SIZE_PX}px`,
        height: `${EVENT_MARKER_SIZE_PX}px`,
        borderRadius: '50%',
        background: ghost ? 'var(--bg)' : color,
        boxShadow: ghost
          ? `inset 0 0 0 1px ${color}, 0 0 0 3px var(${active ? '--bg-tag' : '--bg'})`
          : `0 0 0 3px var(${active ? '--bg-tag' : '--bg'})`,
      }}
    >
    </span>
  )
}

function PointEvent({
  event,
  x,
  lane,
  pitch,
  mode,
  dragging,
  active,
  selected,
  onSelect,
  onHover,
}: {
  event: TimelineEventView
  x: number
  lane: number
  pitch: number
  mode: 'label' | 'dot'
  dragging: boolean
  active: boolean
  selected: boolean
  onSelect: () => void
  onHover: (id: string | null) => void
}): ReactNode {
  const color = normalizeDataColor(event.color)
  return (
    <button
      type="button"
      className={[
        'tl-marker',
        mode === 'dot' ? 'is-bare' : '',
        active ? 'is-on' : '',
        event.isLibrary ? 'tl-library-item' : '',
      ].filter(Boolean).join(' ')}
      data-testid="timeline-event"
      data-event-id={event.id}
      data-shape="point"
      aria-label={event.title}
      aria-pressed={selected}
      onClick={onSelect}
      onMouseEnter={() => { if (!dragging) onHover(event.id) }}
      onMouseLeave={() => onHover(null)}
      style={{ ...markerButtonStyle(x, lane, pitch, active), opacity: event.isLibrary ? 0.42 : 1 }}
    >
      <Dot color={color} active={active} ghost={event.isLibrary} />
      {mode === 'label' ? (
        <span
          className="tl-marker-row"
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
            className="tl-label"
            data-testid="timeline-event-label"
            style={labelStyle}
          >
            {event.title}
          </span>
          <span className="tl-date" style={dateStyle}>{formatCanvasDate(event)}</span>
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
  pitch,
  dragging,
  active,
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
  pitch: number
  dragging: boolean
  active: boolean
  selected: boolean
  labelX: number
  labelled: boolean
  onSelect: () => void
  onHover: (id: string | null) => void
}): ReactNode {
  const color = normalizeDataColor(event.color)

  return (
    <button
      type="button"
      className={[
        'tl-span',
        active ? 'is-on' : '',
        event.isLibrary ? 'tl-library-item' : '',
      ].filter(Boolean).join(' ')}
      data-testid="timeline-event"
      data-event-id={event.id}
      data-shape="interval"
      aria-label={event.title}
      aria-pressed={selected}
      onClick={onSelect}
      onMouseEnter={() => { if (!dragging) onHover(event.id) }}
      onMouseLeave={() => onHover(null)}
      style={{
        position: 'absolute',
        left: `${startX}px`,
        bottom: `${eventBottom(lane, pitch)}px`,
        width: `${Math.max(endX - startX, 4)}px`,
        height: `${MARKER_ROW_HEIGHT_PX}px`,
        padding: 0,
        border: 'none',
        background: 'none',
        cursor: 'pointer',
        textAlign: 'left',
        zIndex: active ? 2 : 1,
        opacity: event.isLibrary ? 0.42 : 1,
      }}
    >
      {/* Отрезок от начала к концу — линией цвета типа, без заливки блока. */}
      <span
        aria-hidden="true"
        className="tl-span-rule"
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          bottom: 0,
          background: event.isLibrary ? 'transparent' : color,
          borderTop: event.isLibrary ? `1px dashed ${color}` : 'none',
        }}
      />
      <span aria-hidden="true" className="tl-span-cap" style={{ position: 'absolute', left: 0, bottom: 0, width: '1px', height: '8px', background: color }} />
      <span aria-hidden="true" className="tl-span-cap" style={{ position: 'absolute', right: 0, bottom: 0, width: '1px', height: '8px', background: color }} />
      {labelled ? (
        <span
          className="tl-span-row"
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
            className="tl-label"
            data-testid="timeline-event-label"
            style={labelStyle}
          >
            {event.title}
          </span>
          <span className="tl-date" style={dateStyle}>{formatCanvasDate(event)}</span>
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
  hoverId?: string | undefined
  selectedId?: string | undefined
  onHoverChange: (id: string | null) => void
  onSelect: (id: string) => void
  onCluster: (range: { start: number; end: number }) => void
}

interface VisibleClusterGeometry {
  memberIds: string[]
  start: number
  end: number
  x: number
  intersectsCanvas: boolean
}

export function visibleClusterGeometry(
  memberIds: readonly string[],
  visibleEventIds: ReadonlySet<string>,
  xById: ReadonlyMap<string, number>,
  width: number,
): VisibleClusterGeometry | null {
  const visibleMembers = memberIds
    .filter((id) => visibleEventIds.has(id))
    .map((id) => ({ id, x: xById.get(id) }))
    .filter((member): member is { id: string; x: number } => member.x !== undefined)

  if (visibleMembers.length === 0) return null

  const positions = visibleMembers.map(({ x }) => x)
  const start = Math.min(...positions)
  const end = Math.max(...positions)
  const x = (start + end) / 2
  const halfWidth = visibleMembers.length === 1 ? EVENT_MARKER_SIZE_PX / 2 : 12

  return {
    memberIds: visibleMembers.map(({ id }) => id),
    start,
    end,
    x,
    intersectsCanvas: x + halfWidth >= 0 && x - halfWidth <= width,
  }
}

export default function TimelineEventLayer({
  events,
  visibleEventIds,
  range,
  width,
  height,
  dragging,
  hoverId,
  selectedId,
  onHoverChange,
  onSelect,
  onCluster,
}: Props) {
  const measureText = useMemo(() => createTextMeasurer(), [])
  const transform = createViewportTransform(range, width)
  const eventById = new Map(events.map((event) => [event.id, event]))
  const eventXById = new Map(events.map((event) => [
    event.id,
    transform.toX(dateRangeForEvent(event).start),
  ]))
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
    measureText,
    labelFont: EVENT_LABEL_FONT,
    dateFont: EVENT_DATE_FONT,
  })
  const lanePitch = eventLanePitch(height, layout.laneCount)
  const activeAxisDots = [
    ...layout.markers.flatMap((marker) => {
      const event = eventById.get(marker.id)
      if (
        event === undefined ||
        !visibleEventIds.has(marker.id) ||
        !marker.intersectsCanvas ||
        (event.id !== hoverId && event.id !== selectedId)
      ) return []
      return [{ key: `marker-${event.id}`, x: marker.x, color: normalizeDataColor(event.color) }]
    }),
    ...layout.clusters.flatMap((cluster) => {
      const visibleCluster = visibleClusterGeometry(
        cluster.memberIds,
        visibleEventIds,
        eventXById,
        width,
      )
      if (
        visibleCluster === null ||
        !visibleCluster.intersectsCanvas ||
        visibleCluster.memberIds.length !== 1
      ) return []
      const event = eventById.get(visibleCluster.memberIds[0]!)
      if (event === undefined || (event.id !== hoverId && event.id !== selectedId)) return []
      return [{
        key: `cluster-${cluster.id}`,
        x: visibleCluster.x,
        color: normalizeDataColor(event.color),
      }]
    }),
  ]

  return (
    <>
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
          !placement.intersectsCanvas ||
          (event.id !== hoverId && event.id !== selectedId)
        ) return null
        return (
          <span
            key={`area-${event.id}`}
            aria-hidden="true"
            className="tl-span-area"
            data-testid="timeline-span-area"
            style={{
              left: `${placement.startX}px`,
              width: `${Math.max(placement.endX - placement.startX, 4)}px`,
              height: `${eventBottom(placement.lane, lanePitch)}px`,
              background: normalizeDataColor(event.color),
            }}
          />
        )
      })}
      {layout.spans.map((placement) => {
        const event = eventById.get(placement.id)
        if (
          event === undefined ||
          !visibleEventIds.has(placement.id) ||
          !placement.intersectsCanvas
        ) return null
        const startVisible = placement.startX >= 0 && placement.startX <= width
        const endVisible = placement.endX >= 0 && placement.endX <= width
        const active = event.id === hoverId || event.id === selectedId
        return (
          <span key={event.id}>
            {startVisible ? <Connector x={placement.startX} lane={placement.lane} pitch={lanePitch} active={active} ghost={event.isLibrary} /> : null}
            {!event.ongoing && endVisible ? (
              <Connector x={placement.endX} lane={placement.lane} pitch={lanePitch} active={active} ghost={event.isLibrary} />
            ) : null}
            <IntervalEvent
              event={event}
              startX={placement.startX}
              endX={placement.endX}
              lane={placement.lane}
              pitch={lanePitch}
              dragging={dragging}
              labelX={placement.labelX}
              labelled={placement.labelled}
              active={active}
              selected={event.id === selectedId}
              onSelect={() => onSelect(event.id)}
              onHover={onHoverChange}
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
        const active = event.id === hoverId || event.id === selectedId
        return (
          <span key={event.id}>
            <Connector x={marker.x} lane={marker.lane} pitch={lanePitch} active={active} ghost={event.isLibrary} />
            <PointEvent
              event={event}
              x={marker.x}
              lane={marker.lane}
              pitch={lanePitch}
              mode={marker.mode}
              dragging={dragging}
              active={active}
              selected={event.id === selectedId}
              onSelect={() => onSelect(event.id)}
              onHover={onHoverChange}
            />
          </span>
        )
      })}
      {layout.clusters.map((cluster) => {
        const visibleCluster = visibleClusterGeometry(
          cluster.memberIds,
          visibleEventIds,
          eventXById,
          width,
        )
        if (visibleCluster === null || !visibleCluster.intersectsCanvas) return null

        if (visibleCluster.memberIds.length === 1) {
          const event = eventById.get(visibleCluster.memberIds[0]!)
          if (event === undefined) return null
          const active = event.id === hoverId || event.id === selectedId
          return <span key={cluster.id}>
            <Connector
              x={visibleCluster.x}
              lane={cluster.lane}
              pitch={lanePitch}
              active={active}
              ghost={event.isLibrary}
            />
            <PointEvent
              event={event}
              x={visibleCluster.x}
              lane={cluster.lane}
              pitch={lanePitch}
              mode="dot"
              dragging={dragging}
              active={active}
              selected={event.id === selectedId}
              onSelect={() => onSelect(event.id)}
              onHover={onHoverChange}
            />
          </span>
        }

        return <span key={cluster.id}>
          <Connector x={visibleCluster.x} lane={cluster.lane} pitch={lanePitch} active={false} />
          <button
            type="button"
            data-testid="timeline-cluster"
            aria-label={`${visibleCluster.memberIds.length} событий — приблизить`}
            onClick={() => onCluster({
              start: transform.fromX(visibleCluster.start),
              end: transform.fromX(visibleCluster.end),
            })}
            style={{
              ...markerButtonStyle(visibleCluster.x, cluster.lane, lanePitch, false),
              width: '20px',
              left: `${visibleCluster.x - 10}px`,
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
            {visibleCluster.memberIds.length}
          </button>
        </span>
      })}
      </div>
      {activeAxisDots.map((dot) => (
        <span
          key={dot.key}
          aria-hidden="true"
          className="tl-axis-dot"
          data-testid="timeline-axis-dot"
          style={{ left: `${dot.x}px`, background: dot.color }}
        />
      ))}
    </>
  )
}
