'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  dateRangeForEvent,
  bringCoordinateIntoView,
  fitRange,
  historicalDateToCoordinate,
  type VisibleRange,
} from '@/lib/timeline'
import type { TimelineViewData } from '@/lib/timeline/view-model'
import { resolveTimelineInitialRange } from '@/lib/timeline/view-model'
import TimelineDetailCard from './TimelineDetailCard'
import TimelineEpochLayer from './TimelineEpochLayer'
import TimelineEventLayer from './TimelineEventLayer'
import TimelineLegend, { type TimelineLegendType } from './TimelineLegend'
import TimelineMobileList from './TimelineMobileList'
import TimelineRuler from './TimelineRuler'
import { useTimelineNavigation } from './use-timeline-navigation'

/**
 * Клиентский оркестратор ленты: держит видимый диапазон и выбранный элемент,
 * собирает слои. Начальные `filterTypeIds` и `showAll` из данных применяются,
 * но управления ими на этом этапе нет — фильтры относятся к этапу 6.
 */

const FALLBACK_WIDTH_PX = 1000
const FALLBACK_HEIGHT_PX = 200
/** Сохранённый в базе список типов, означающий «скрыть все события». */
const HIDE_ALL_EVENT_TYPES = '__none__'

interface Props {
  timeline: TimelineViewData
  isAdmin?: boolean
}

function fitTimelineRange(timeline: TimelineViewData): VisibleRange {
  const values = [
    ...timeline.events.flatMap((event) => {
      const range = dateRangeForEvent(event)
      return [range.start, range.end]
    }),
    ...timeline.epochs.flatMap((epoch) => [
      historicalDateToCoordinate(epoch.start),
      historicalDateToCoordinate(epoch.end),
    ]),
  ]
  return fitRange(values, 0.15)
}

export default function TimelineView({ timeline, isAdmin = false }: Props) {
  const router = useRouter()
  const rootRef = useRef<HTMLDivElement>(null)
  const eventsRef = useRef<HTMLDivElement>(null)
  const [measuredWidth, setMeasuredWidth] = useState(FALLBACK_WIDTH_PX)
  const [measuredHeight, setMeasuredHeight] = useState(FALLBACK_HEIGHT_PX)
  const [range, setRange] = useState<VisibleRange>(() => resolveTimelineInitialRange(timeline))
  const [selected, setSelected] = useState<{ kind: 'event' | 'epoch'; id: string } | null>(null)
  const [dragging, setDragging] = useState(false)
  const eventTypes = useMemo<TimelineLegendType[]>(() => {
    const byId = new Map<string, TimelineLegendType>()
    timeline.events.filter((event) => event.visible).forEach((event) => {
      const existing = byId.get(event.typeId)
      if (existing === undefined) {
        byId.set(event.typeId, {
          id: event.typeId,
          title: event.typeTitle,
          color: event.color,
          count: 1,
        })
      } else {
        existing.count += 1
      }
    })
    return Array.from(byId.values())
  }, [timeline.events])
  const [enabledTypeIds, setEnabledTypeIds] = useState<Set<string>>(() => {
    const allIds = new Set(timeline.events.map((event) => event.typeId))
    if (timeline.filterTypeIds.includes(HIDE_ALL_EVENT_TYPES)) return new Set()
    return timeline.filterTypeIds.length === 0 ? allIds : new Set(timeline.filterTypeIds)
  })
  const [epochsEnabled, setEpochsEnabled] = useState(timeline.epochsVisible)

  const events = useMemo(() => {
    return timeline.events.filter((event) => event.visible && enabledTypeIds.has(event.typeId))
  }, [timeline.events, enabledTypeIds])

  const navigation = useTimelineNavigation({
    rootRef,
    range,
    width: measuredWidth,
    onViewportChange: setRange,
    onFit: () => setRange(fitTimelineRange(timeline)),
    onEscape: () => setSelected(null),
    onDraggingChange: setDragging,
  })

  useEffect(() => {
    const eventsBox = eventsRef.current
    if (eventsBox === null) return
    const updateSize = () => {
      const next = eventsBox.getBoundingClientRect()
      if (next.width > 0) setMeasuredWidth(next.width)
      if (next.height > 0) setMeasuredHeight(next.height)
    }
    updateSize()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(updateSize)
    observer.observe(eventsBox)
    return () => observer.disconnect()
  }, [])

  const selectedEvent = selected?.kind === 'event'
    ? events.find((event) => event.id === selected.id) ?? null
    : null
  const selectedEpoch = selected?.kind === 'epoch'
    ? timeline.epochs.find((epoch) => epoch.id === selected.id) ?? null
    : null
  const detail = selectedEvent !== null
    ? ({ kind: 'event', item: selectedEvent } as const)
    : selectedEpoch !== null
      ? ({ kind: 'epoch', item: selectedEpoch } as const)
      : null

  function selectEvent(id: string): void {
    const event = events.find((candidate) => candidate.id === id)
    if (event === undefined) return
    setSelected({ kind: 'event', id })
    const nextRange = bringCoordinateIntoView(range, dateRangeForEvent(event).start, measuredWidth, 80)
    if (nextRange !== range) setRange(nextRange)
  }

  function toggleType(id: string): void {
    setEnabledTypeIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="nd-timeline-view">
      <div className="hidden md:flex nd-timeline-desktop" data-testid="timeline-canvas-wrapper">
        <div className="nd-timeline-detail-shell">
          <TimelineDetailCard
            selected={detail}
            timelineId={timeline.id}
            isAdmin={isAdmin}
            onClose={() => setSelected(null)}
            onChanged={() => {
              setSelected(null)
              router.refresh()
            }}
          />
        </div>
        <div className="nd-timeline-spacer" aria-hidden="true" />
        <div className="nd-timeline-canvas-region">
          <TimelineLegend
            eventTypes={eventTypes}
            enabledTypeIds={enabledTypeIds}
            epochsEnabled={epochsEnabled}
            epochCount={timeline.epochs.filter((epoch) => epoch.visible).length}
            onToggleType={toggleType}
            onToggleEpochs={() => setEpochsEnabled((current) => !current)}
            onZoomIn={navigation.zoomIn}
            onZoomOut={navigation.zoomOut}
            onFit={navigation.fit}
          />
          <div
            ref={rootRef}
            className={`nd-timeline-canvas${dragging ? ' is-dragging' : ''}`}
            tabIndex={0}
            data-testid="timeline-canvas"
            aria-label={`Лента времени: ${timeline.title}`}
            style={{
              position: 'relative',
              background: 'var(--bg)',
              border: 'none',
              borderTop: '1px solid var(--hair)',
              touchAction: 'pan-y',
            }}
          >
            <div ref={eventsRef} className="nd-timeline-events-shell">
              <TimelineEventLayer
                events={events}
                range={range}
                width={measuredWidth}
                height={measuredHeight}
                dragging={dragging}
                selectedId={selected?.kind === 'event' ? selected.id : undefined}
                onSelect={selectEvent}
                onCluster={(clusterRange) => setRange(fitRange([clusterRange.start, clusterRange.end], 0.5))}
              />
            </div>
            <TimelineRuler range={range} width={measuredWidth} />
            {epochsEnabled ? (
              <TimelineEpochLayer
                epochs={timeline.epochs}
                range={range}
                width={measuredWidth}
                dragging={dragging}
                selectedId={selected?.kind === 'epoch' ? selected.id : undefined}
                onSelect={(id) => setSelected({ kind: 'epoch', id })}
              />
            ) : null}
          </div>
          <p className="nd-timeline-help">
            Перетащите полотно мышью · Ctrl + колесо — масштаб · клавиши +, −, F
          </p>
        </div>
      </div>

      <div className="md:hidden" data-testid="timeline-mobile">
        <TimelineMobileList events={events} />
      </div>
    </div>
  )
}
