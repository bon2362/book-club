'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import {
  dateRangeForEvent,
  fitRange,
  historicalDateToCoordinate,
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
const FALLBACK_HEIGHT_PX = 200
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

/**
 * Публичная страница всегда открывается «вместив» всё содержимое.
 *
 * Сохранённые в базе `viewportStart`/`viewportEnd` для этого не годятся: это
 * состояние редактора локального приложения, застывшее там, где владелец
 * прекратил работу. У «Всеобщей истории» оно показывало 4 события из 31 —
 * человек, открывший присланную ссылку, видел почти пустое полотно.
 *
 * Осмысленный стартовый вид владелец сможет задать на этапе 4, когда появится
 * редактор; до тех пор сохранённые значения на просмотр не влияют.
 */
function resolveInitialRange(timeline: TimelineViewData): VisibleRange {
  return initialRange(timeline)
}

export default function TimelineView({ timeline }: Props) {
  const rootRef = useRef<HTMLDivElement>(null)
  const eventsRef = useRef<HTMLDivElement>(null)
  const [measuredWidth, setMeasuredWidth] = useState(FALLBACK_WIDTH_PX)
  const [measuredHeight, setMeasuredHeight] = useState(FALLBACK_HEIGHT_PX)
  const [range, setRange] = useState<VisibleRange>(() => resolveInitialRange(timeline))
  const [selected, setSelected] = useState<{ kind: 'event' | 'epoch'; id: string } | null>(null)
  const [dragging, setDragging] = useState(false)

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
    // Выбранное событие подтягивается в центр — как в исходном приложении.
    const center = dateRangeForEvent(event).start
    const span = range.end - range.start
    setRange({ start: center - span / 2, end: center + span / 2 })
  }

  return (
    <div className="nd-timeline-view">
      <div className="hidden md:flex nd-timeline-desktop" data-testid="timeline-canvas-wrapper">
        <div className="nd-timeline-detail-shell">
          <TimelineDetailCard selected={detail} onClose={() => setSelected(null)} />
        </div>
        <div className="nd-timeline-spacer" aria-hidden="true" />
        <div className="nd-timeline-canvas-region">
          <TimelineControls onZoomIn={navigation.zoomIn} onZoomOut={navigation.zoomOut} onFit={navigation.fit} />
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
            {timeline.epochsVisible ? (
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
