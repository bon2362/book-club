'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  dateRangeForEvent,
  fitRange,
  historicalDateToCoordinate,
  type DensityStage,
  type VisibleRange,
} from '@/lib/timeline'
import type { TimelineViewData } from '@/lib/timeline/view-model'
import TimelineControls from './TimelineControls'
import TimelineDetailCard from './TimelineDetailCard'
import TimelineEpochLayer from './TimelineEpochLayer'
import TimelineEventLayer from './TimelineEventLayer'
import TimelineMobileList from './TimelineMobileList'
import TimelineRuler from './TimelineRuler'
import { useTimelineNavigation } from './use-timeline-navigation'

/**
 * Клиентский оркестратор ленты: держит видимый диапазон и выбранный элемент,
 * собирает слои. Начальные `filterTypeIds` и `showAll` из данных применяются,
 * но управления ими на этом этапе нет — фильтры относятся к этапу 6.
 */

const FALLBACK_WIDTH_PX = 1000
/** Сохранённый в базе список типов, означающий «скрыть все события». */
const HIDE_ALL_EVENT_TYPES = '__none__'

interface Props {
  timeline: TimelineViewData
}

function initialRange(timeline: TimelineViewData): VisibleRange {
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

function resolveInitialRange(timeline: TimelineViewData): VisibleRange {
  const { viewportStart, viewportEnd } = timeline
  if (viewportStart !== null && viewportEnd !== null && viewportEnd > viewportStart) {
    return { start: viewportStart, end: viewportEnd }
  }
  return initialRange(timeline)
}

function densityStage(range: VisibleRange, width: number): DensityStage {
  const unitsPerPixel = (range.end - range.start) / Math.max(width, 1)
  if (unitsPerPixel <= 0.2) return 'full-label'
  if (unitsPerPixel <= 1) return 'shortened-label'
  if (unitsPerPixel <= 4) return 'marker-only'
  return 'cluster'
}

export default function TimelineView({ timeline }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [measuredWidth, setMeasuredWidth] = useState(FALLBACK_WIDTH_PX)
  const [range, setRange] = useState<VisibleRange>(() => resolveInitialRange(timeline))
  const [selected, setSelected] = useState<{ kind: 'event' | 'epoch'; id: string } | null>(null)

  const events = useMemo(() => {
    if (timeline.filterTypeIds.length === 0) return timeline.events
    if (timeline.filterTypeIds.includes(HIDE_ALL_EVENT_TYPES)) return []
    return timeline.events.filter((event) => timeline.filterTypeIds.includes(event.typeId))
  }, [timeline.events, timeline.filterTypeIds])

  const navigation = useTimelineNavigation({
    rootRef,
    range,
    width: measuredWidth,
    onViewportChange: setRange,
    onFit: () => setRange(initialRange(timeline)),
  })

  useEffect(() => {
    const root = rootRef.current
    if (root === null) return
    const updateWidth = () => {
      const next = root.getBoundingClientRect().width
      if (next > 0) setMeasuredWidth(next)
    }
    updateWidth()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(updateWidth)
    observer.observe(root)
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
    // Выбранное событие подтягивается в центр — как в исходном приложении.
    const center = dateRangeForEvent(event).start
    const span = range.end - range.start
    setRange({ start: center - span / 2, end: center + span / 2 })
  }

  return (
    <div>
      <div className="hidden md:block" data-testid="timeline-canvas-wrapper">
        <TimelineControls onZoomIn={navigation.zoomIn} onZoomOut={navigation.zoomOut} onFit={navigation.fit} />
        <div
          ref={rootRef}
          tabIndex={0}
          data-testid="timeline-canvas"
          aria-label={`Лента времени: ${timeline.title}`}
          style={{
            position: 'relative',
            overflow: 'hidden',
            background: 'var(--bg-input)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            touchAction: 'pan-y',
          }}
        >
          <TimelineEventLayer
            events={events}
            range={range}
            width={measuredWidth}
            densityStage={densityStage(range, measuredWidth)}
            showAll={timeline.showAll}
            selectedId={selected?.kind === 'event' ? selected.id : undefined}
            onSelect={selectEvent}
            onCluster={(clusterRange) => setRange(fitRange([clusterRange.start, clusterRange.end], 0.5))}
          />
          <TimelineRuler range={range} width={measuredWidth} />
          {timeline.epochsVisible ? (
            <TimelineEpochLayer
              epochs={timeline.epochs}
              range={range}
              width={measuredWidth}
              selectedId={selected?.kind === 'epoch' ? selected.id : undefined}
              onSelect={(id) => setSelected({ kind: 'epoch', id })}
            />
          ) : null}
        </div>
        <p
          style={{
            fontFamily: 'var(--nd-sans)',
            fontSize: '0.6rem',
            textTransform: 'uppercase',
            letterSpacing: '0.12em',
            color: 'var(--text-muted)',
            margin: '0.5rem 0 1rem',
          }}
        >
          Перетащите полотно мышью · Ctrl + колесо — масштаб · клавиши +, −, F
        </p>
        <TimelineDetailCard selected={detail} onClose={() => setSelected(null)} />
      </div>

      <div className="md:hidden" data-testid="timeline-mobile">
        <TimelineMobileList events={events} />
      </div>
    </div>
  )
}
