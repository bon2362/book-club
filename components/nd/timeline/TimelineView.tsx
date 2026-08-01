'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  assignEpochLanes,
  createViewportTransform,
  dateRangeForEvent,
  bringCoordinateIntoView,
  fitRange,
  tlNow,
  type VisibleRange,
} from '@/lib/timeline'
import type { TimelineViewData } from '@/lib/timeline/view-model'
import { resolveTimelineInitialRange } from '@/lib/timeline/view-model'
import TimelineDetailCard from './TimelineDetailCard'
import TimelineEpochLayer, { EPOCH_LANE_PITCH_PX } from './TimelineEpochLayer'
import TimelineEventLayer from './TimelineEventLayer'
import TimelineLegend, { type TimelineLegendType } from './TimelineLegend'
import TimelineMobileList from './TimelineMobileList'
import TimelineRuler from './TimelineRuler'
import TimelineAdminTools, { type TimelineSearchItem } from './TimelineAdminTools'
import TimelineCreateForm from './TimelineCreateForm'
import { DEFAULT_TIMELINE_EPOCH_COLOR } from './admin/palette'
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

function TimelineNow({
  range,
  width,
  epochs,
  showEpochs,
}: {
  range: VisibleRange
  width: number
  epochs: TimelineViewData['epochs']
  showEpochs: boolean
}) {
  const nowX = createViewportTransform(range, width).toX(tlNow())
  if (nowX < -60 || nowX > width + 60) return null

  const epochLaneCount = assignEpochLanes(epochs.map((epoch) => ({
    id: epoch.id,
    start: epoch.start,
    end: epoch.end,
    ...(epoch.pinnedLane === undefined ? {} : { pinnedLane: epoch.pinnedLane }),
  }))).laneCount
  const belowHeight = 35 + (showEpochs ? Math.max(epochLaneCount, 1) * EPOCH_LANE_PITCH_PX + 2 : 0)

  return (
    <>
      <span
        aria-hidden="true"
        className="tl-future"
        data-testid="timeline-future"
        style={{ left: `${Math.max(nowX, 0)}px`, bottom: `${-belowHeight}px` }}
      />
      <span
        aria-label="Сегодня"
        className="tl-now"
        data-testid="timeline-now"
        style={{ left: `${nowX}px`, bottom: `${-belowHeight}px` }}
      >
        <span aria-hidden="true" className="tl-now-cap" />
        <span className="tl-now-label">Сегодня</span>
      </span>
    </>
  )
}

interface Props {
  timeline: TimelineViewData
  isAdmin?: boolean
}

export default function TimelineView({ timeline, isAdmin = false }: Props) {
  const router = useRouter()
  const rootRef = useRef<HTMLDivElement>(null)
  const eventsRef = useRef<HTMLDivElement>(null)
  const [measuredSize, setMeasuredSize] = useState({
    width: FALLBACK_WIDTH_PX,
    height: FALLBACK_HEIGHT_PX,
  })
  const { width: measuredWidth, height: measuredHeight } = measuredSize
  const [range, setRange] = useState<VisibleRange>(() => resolveTimelineInitialRange(timeline))
  const [selected, setSelected] = useState<{ kind: 'event' | 'epoch'; id: string } | null>(null)
  const [hoverId, setHoverId] = useState<string | null>(null)
  const [creating, setCreating] = useState<'event' | 'epoch' | null>(null)
  const [pendingSelection, setPendingSelection] = useState<{ kind: 'event' | 'epoch'; id: string } | null>(null)
  const [showLibrary, setShowLibrary] = useState(false)
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

  const libraryEvents = useMemo(() => timeline.libraryEvents.map((event) => ({
    ...event,
    note: '',
    visible: true,
    isLibrary: true,
  })), [timeline.libraryEvents])
  const libraryEpochs = useMemo(() => timeline.libraryEpochs.map((epoch) => ({
    ...epoch,
    note: '',
    color: DEFAULT_TIMELINE_EPOCH_COLOR,
    visible: true,
    isLibrary: true,
  })), [timeline.libraryEpochs])

  const allEvents = useMemo(
    () => [...timeline.events, ...libraryEvents],
    [timeline.events, libraryEvents],
  )
  const events = useMemo(() => {
    const attached = timeline.events.filter((event) => event.visible && enabledTypeIds.has(event.typeId))
    return showLibrary ? [...attached, ...libraryEvents] : attached
  }, [timeline.events, enabledTypeIds, showLibrary, libraryEvents])
  const visibleEventIds = useMemo(
    () => new Set(events.map(({ id }) => id)),
    [events],
  )
  const epochs = useMemo(
    () => [...timeline.epochs, ...libraryEpochs],
    [timeline.epochs, libraryEpochs],
  )
  const searchItems = useMemo<TimelineSearchItem[]>(() => [
    ...timeline.events.map((item) => ({ kind: 'event' as const, item })),
    ...timeline.epochs.map((item) => ({ kind: 'epoch' as const, item })),
    ...libraryEvents.map((item) => ({ kind: 'event' as const, item })),
    ...libraryEpochs.map((item) => ({ kind: 'epoch' as const, item })),
  ], [timeline.events, timeline.epochs, libraryEvents, libraryEpochs])

  const navigation = useTimelineNavigation({
    rootRef,
    range,
    width: measuredWidth,
    onViewportChange: setRange,
    onEscape: () => setSelected(null),
    onDraggingChange: (nextDragging) => {
      setDragging(nextDragging)
      if (nextDragging) setHoverId(null)
    },
  })

  useEffect(() => {
    const eventsBox = eventsRef.current
    if (eventsBox === null) return
    const updateSize = () => {
      const next = eventsBox.getBoundingClientRect()
      if (next.width <= 0 || next.height <= 0) return
      setMeasuredSize((current) => (
        current.width === next.width && current.height === next.height
          ? current
          : { width: next.width, height: next.height }
      ))
    }
    updateSize()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(updateSize)
    observer.observe(eventsBox)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (pendingSelection === null) return
    const exists = pendingSelection.kind === 'event'
      ? timeline.events.some(({ id }) => id === pendingSelection.id)
      : timeline.epochs.some(({ id }) => id === pendingSelection.id)
    if (!exists) return
    if (pendingSelection.kind === 'event') {
      const attached = timeline.events.find(({ id }) => id === pendingSelection.id)
      if (attached !== undefined) {
        setEnabledTypeIds((current) => new Set(current).add(attached.typeId))
      }
    } else {
      setEpochsEnabled(true)
    }
    setSelected(pendingSelection)
    setPendingSelection(null)
  }, [pendingSelection, timeline.events, timeline.epochs])

  const selectedEvent = selected?.kind === 'event'
    ? allEvents.find((event) => event.id === selected.id) ?? null
    : null
  const selectedEpoch = selected?.kind === 'epoch'
    ? [...timeline.epochs, ...libraryEpochs].find((epoch) => epoch.id === selected.id) ?? null
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
          {creating ? (
            <TimelineCreateForm
              kind={creating}
              timelineId={timeline.id}
              range={range}
              onCancel={() => setCreating(null)}
              onCreated={(kind, id) => {
                setCreating(null)
                setPendingSelection({ kind, id })
                router.refresh()
              }}
            />
          ) : <TimelineDetailCard
            selected={detail}
            timelineId={timeline.id}
            isAdmin={isAdmin}
            onClose={() => setSelected(null)}
            onChanged={(keepSelection) => {
              if (keepSelection === undefined) setSelected(null)
              else setPendingSelection(keepSelection)
              router.refresh()
            }}
          />}
        </div>
        <div className="nd-timeline-canvas-region">
          {isAdmin ? (
            <TimelineAdminTools
              items={searchItems}
              onCreate={(kind) => { setSelected(null); setCreating(kind) }}
              onSelect={(next) => { setCreating(null); setSelected({ kind: next.kind, id: next.item.id }) }}
            />
          ) : null}
          <TimelineLegend
            eventTypes={eventTypes}
            enabledTypeIds={enabledTypeIds}
            epochsEnabled={epochsEnabled}
            epochCount={timeline.epochs.filter((epoch) => epoch.visible).length}
            onToggleType={toggleType}
            onToggleEpochs={() => setEpochsEnabled((current) => !current)}
            onZoomIn={navigation.zoomIn}
            onZoomOut={navigation.zoomOut}
            showLibrary={showLibrary}
            onToggleLibrary={isAdmin ? () => setShowLibrary((current) => !current) : undefined}
          />
          <div
            ref={rootRef}
            className={`nd-timeline-canvas${dragging ? ' is-dragging' : ''}`}
            tabIndex={0}
            data-testid="timeline-canvas"
            aria-label={`Лента времени: ${timeline.title}`}
            onWheel={() => setHoverId(null)}
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
                events={allEvents}
                visibleEventIds={visibleEventIds}
                range={range}
                width={measuredWidth}
                height={measuredHeight}
                dragging={dragging}
                hoverId={hoverId ?? undefined}
                selectedId={selected?.kind === 'event' ? selected.id : undefined}
                onHoverChange={(id) => {
                  if (id === null || !dragging) setHoverId(id)
                }}
                onSelect={selectEvent}
                onCluster={(clusterRange) => setRange(fitRange([clusterRange.start, clusterRange.end], 0.5))}
              />
              <TimelineNow
                range={range}
                width={measuredWidth}
                epochs={epochs}
                showEpochs={epochsEnabled}
              />
            </div>
            <TimelineRuler range={range} width={measuredWidth} />
            <TimelineEpochLayer
              epochs={epochs}
              enabled={epochsEnabled}
              showLibrary={showLibrary}
              range={range}
              width={measuredWidth}
              dragging={dragging}
              hoverId={hoverId ?? undefined}
              selectedId={selected?.kind === 'epoch' ? selected.id : undefined}
              onHoverChange={(id) => {
                if (id === null || !dragging) setHoverId(id)
              }}
              onSelect={(id) => setSelected({ kind: 'epoch', id })}
            />
          </div>
          <p className="nd-timeline-help">
            Перетащите полотно мышью · Ctrl + колесо — масштаб · клавиши +, −
          </p>
        </div>
      </div>

      <div className="md:hidden" data-testid="timeline-mobile">
        <TimelineMobileList events={events} />
      </div>
    </div>
  )
}
